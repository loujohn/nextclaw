#!/usr/bin/env python3
"""GitLab API 工具 - Code Review 辅助脚本

支持操作：
- get-diff: 获取 MR 的代码变更
- get-push-diff: 获取 Push 事件的代码变更
- get-mr: 获取 MR 详细信息
- post-comment: 发表行级评论
- post-note: 发表 MR 总体评论
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
import urllib.parse


def build_url(gitlab_url: str, path: str) -> str:
    """构建 GitLab API URL"""
    base = gitlab_url.rstrip("/")
    api_path = path.lstrip("/")
    return f"{base}/api/v4/{api_path}"


def make_request(
    url: str, token: str, method: str = "GET", data: dict | None = None
) -> dict | list:
    """发送 HTTP 请求到 GitLab API"""
    headers = {
        "PRIVATE-TOKEN": token,
        "Content-Type": "application/json",
    }

    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")

    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status == 204:
                return {}
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        print(
            json.dumps(
                {
                    "error": True,
                    "status": e.code,
                    "message": f"GitLab API error: {e.reason}",
                    "details": error_body,
                }
            ),
            file=sys.stderr,
        )
        sys.exit(1)
    except urllib.error.URLError as e:
        print(
            json.dumps({"error": True, "message": f"Network error: {e.reason}"}),
            file=sys.stderr,
        )
        sys.exit(1)


def get_mr_info(args):
    """获取 MR 详细信息"""
    path = f"projects/{args.project_id}/merge_requests/{args.mr_iid}"
    url = build_url(args.gitlab_url, path)
    result = make_request(url, args.token)
    print(json.dumps(result, indent=2, ensure_ascii=False))


def get_mr_commits(args):
    """获取 MR 的所有提交（commits）"""
    path = f"projects/{args.project_id}/merge_requests/{args.mr_iid}/commits"
    url = build_url(args.gitlab_url, path)
    commits = make_request(url, args.token)

    # 同时获取 MR 信息以获取 web_url
    mr_path = f"projects/{args.project_id}/merge_requests/{args.mr_iid}"
    mr_url = build_url(args.gitlab_url, mr_path)
    mr_info = make_request(mr_url, args.token)
    mr_web_url = mr_info.get("web_url", "")

    result_commits = []
    for commit in commits:
        commit_id = commit.get("id", "")
        short_id = commit.get("short_id", commit_id[:8])
        result_commits.append(
            {
                "id": commit_id,
                "short_id": short_id,
                "message": commit.get("title", ""),
                "full_message": commit.get("message", ""),
                "author_name": commit.get("author_name", ""),
                "author_email": commit.get("author_email", ""),
                "authored_date": commit.get("authored_date", ""),
                "commit_url": f"{mr_web_url}/commits/{commit_id}" if mr_web_url else "",
                "web_url": commit.get("web_url", ""),
            }
        )

    output = {
        "project_id": args.project_id,
        "mr_iid": args.mr_iid,
        "mr_url": mr_web_url,
        "commits_count": len(result_commits),
        "commits": result_commits,
    }
    print(json.dumps(output, indent=2, ensure_ascii=False))


def get_mr_diff(args):
    """获取 MR 的代码变更（diff）"""
    path = f"projects/{args.project_id}/merge_requests/{args.mr_iid}/changes"
    url = build_url(args.gitlab_url, path)
    result = make_request(url, args.token)

    # 提取关键信息
    changes = []
    for change in result.get("changes", []):
        changes.append(
            {
                "old_path": change.get("old_path"),
                "new_path": change.get("new_path"),
                "new_file": change.get("new_file"),
                "renamed_file": change.get("renamed_file"),
                "deleted_file": change.get("deleted_file"),
                "diff": change.get("diff", ""),
            }
        )

    output = {
        "project_id": args.project_id,
        "mr_iid": args.mr_iid,
        "title": result.get("title", ""),
        "description": result.get("description", ""),
        "source_branch": result.get("source_branch", ""),
        "target_branch": result.get("target_branch", ""),
        "state": result.get("state", ""),
        "changes_count": len(changes),
        "changes": changes,
    }
    print(json.dumps(output, indent=2, ensure_ascii=False))


def get_push_diff(args):
    """获取 Push 事件的代码变更"""
    # 使用 commits 之间的 diff
    path = f"projects/{args.project_id}/repository/compare"
    params = urllib.parse.urlencode({"from": args.before, "to": args.after})
    url = f"{build_url(args.gitlab_url, path)}?{params}"
    result = make_request(url, args.token)

    changes = []
    for diff in result.get("diffs", []):
        changes.append(
            {
                "old_path": diff.get("old_path"),
                "new_path": diff.get("new_path"),
                "new_file": diff.get("new_file"),
                "deleted_file": diff.get("deleted_file"),
                "diff": diff.get("diff", ""),
            }
        )

    output = {
        "project_id": args.project_id,
        "before": args.before,
        "after": args.after,
        "changes_count": len(changes),
        "changes": changes,
    }
    print(json.dumps(output, indent=2, ensure_ascii=False))


def fetch_diff_refs(gitlab_url: str, token: str, project_id: int, mr_iid: int) -> dict:
    """从 MR 详情中获取 diff_refs（base_sha / head_sha / start_sha）"""
    mr_path = f"projects/{project_id}/merge_requests/{mr_iid}"
    url = build_url(gitlab_url, mr_path)
    mr_info = make_request(url, token)
    refs = mr_info.get("diff_refs", {}) if isinstance(mr_info, dict) else {}
    return {
        "base_sha": refs.get("base_sha", ""),
        "head_sha": refs.get("head_sha", ""),
        "start_sha": refs.get("start_sha", ""),
    }


def post_comment(args):
    """发表 MR 评论（支持行级评论）"""
    path = f"projects/{args.project_id}/merge_requests/{args.mr_iid}/discussions"

    body = {"body": args.body}

    if args.path and args.line:
        base_sha = args.base_sha or ""
        head_sha = args.head_sha or ""
        start_sha = args.start_sha or ""

        if not (base_sha and head_sha and start_sha):
            refs = fetch_diff_refs(args.gitlab_url, args.token, args.project_id, args.mr_iid)
            base_sha = base_sha or refs["base_sha"]
            head_sha = head_sha or refs["head_sha"]
            start_sha = start_sha or refs["start_sha"]

        body["position"] = {
            "base_sha": base_sha,
            "head_sha": head_sha,
            "start_sha": start_sha,
            "position_type": "text",
            "new_path": args.path,
            "new_line": args.line,
        }

    url = build_url(args.gitlab_url, path)
    result = make_request(url, args.token, method="POST", data=body)
    print(
        json.dumps(
            {
                "success": True,
                "discussion_id": result.get("id", ""),
                "note_id": result.get("notes", [{}])[0].get("id", "")
                if result.get("notes")
                else "",
            },
            indent=2,
        )
    )


def post_note(args):
    """发表 MR 总体评论（Note）"""
    path = f"projects/{args.project_id}/merge_requests/{args.mr_iid}/notes"
    url = build_url(args.gitlab_url, path)
    body = {"body": args.body}
    result = make_request(url, args.token, method="POST", data=body)
    print(
        json.dumps(
            {
                "success": True,
                "note_id": result.get("id", ""),
                "url": result.get("url", ""),
            },
            indent=2,
        )
    )


def main():
    parser = argparse.ArgumentParser(description="GitLab API 工具")
    parser.add_argument(
        "--gitlab-url", default=os.environ.get("GITLAB_URL", ""), help="GitLab 实例地址"
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("GITLAB_TOKEN", ""),
        help="GitLab Personal Access Token",
    )
    parser.add_argument("--project-id", type=int, required=True, help="GitLab 项目 ID")

    subparsers = parser.add_subparsers(dest="command", help="子命令")

    # get-mr
    mr_parser = subparsers.add_parser("get-mr", help="获取 MR 信息")
    mr_parser.add_argument("--mr-iid", type=int, required=True, help="MR 的 IID")
    mr_parser.set_defaults(func=get_mr_info)

    # get-commits
    commits_parser = subparsers.add_parser("get-commits", help="获取 MR 的所有提交")
    commits_parser.add_argument("--mr-iid", type=int, required=True, help="MR 的 IID")
    commits_parser.set_defaults(func=get_mr_commits)

    # get-diff
    diff_parser = subparsers.add_parser("get-diff", help="获取 MR 的代码变更")
    diff_parser.add_argument("--mr-iid", type=int, required=True, help="MR 的 IID")
    diff_parser.set_defaults(func=get_mr_diff)

    # get-push-diff
    push_parser = subparsers.add_parser("get-push-diff", help="获取 Push 的代码变更")
    push_parser.add_argument("--before", required=True, help="Push 前的 commit SHA")
    push_parser.add_argument("--after", required=True, help="Push 后的 commit SHA")
    push_parser.set_defaults(func=get_push_diff)

    # post-comment
    comment_parser = subparsers.add_parser("post-comment", help="发表 MR 评论")
    comment_parser.add_argument("--mr-iid", type=int, required=True, help="MR 的 IID")
    comment_parser.add_argument("--body", required=True, help="评论内容")
    comment_parser.add_argument("--path", help="文件路径（行级评论）")
    comment_parser.add_argument("--line", type=int, help="行号（行级评论）")
    comment_parser.add_argument("--base-sha", help="base SHA（行级评论需要）")
    comment_parser.add_argument("--head-sha", help="head SHA（行级评论需要）")
    comment_parser.add_argument("--start-sha", help="start SHA（行级评论需要）")
    comment_parser.set_defaults(func=post_comment)

    # post-note
    note_parser = subparsers.add_parser("post-note", help="发表 MR 总体评论")
    note_parser.add_argument("--mr-iid", type=int, required=True, help="MR 的 IID")
    note_parser.add_argument("--body", required=True, help="评论内容")
    note_parser.set_defaults(func=post_note)

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    if not args.gitlab_url:
        print("错误: 请设置 --gitlab-url 或环境变量 GITLAB_URL", file=sys.stderr)
        sys.exit(1)

    if not args.token:
        print("错误: 请设置 --token 或环境变量 GITLAB_TOKEN", file=sys.stderr)
        sys.exit(1)

    args.func(args)


if __name__ == "__main__":
    main()
