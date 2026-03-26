#!/usr/bin/env node
/**
 * 钉钉通知脚本
 *
 * 群机器人通知:
 *   node dingtalk-notify.js markdown '标题' --file content.md
 *
 * 工作通知:
 *   node dingtalk-notify.js work --user xxx --type markdown --title '标题' --file content.md
 */

const fs = require("fs");
const path = require("path");

// 临时文件列表
const tempFiles = [];

// 退出时清理临时文件
process.on("exit", () => {
  tempFiles.forEach((f) => {
    try {
      fs.unlinkSync(f);
    } catch (e) {}
  });
});

// 捕获 Ctrl+C
process.on("SIGINT", () => {
  tempFiles.forEach((f) => {
    try {
      fs.unlinkSync(f);
    } catch (e) {}
  });
  process.exit();
});

// 清理临时文件
function cleanupTempFiles() {
  tempFiles.forEach((f) => {
    try {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
        console.log("已清理临时文件:", f);
      }
    } catch (e) {}
  });
  tempFiles.length = 0;
}

// 读取文件并自动处理编码
function readFileContent(filePath) {
  const buffer = fs.readFileSync(filePath);
  let text = buffer.toString("utf8");

  if (process.platform === "win32") {
    const hasReplacement = text.includes("\uFFFD");
    const hasChinese = /[\u4e00-\u9fa5]/.test(text);
    if (
      hasReplacement ||
      (!hasChinese && buffer.toString("gbk").match(/[\u4e00-\u9fa5]/))
    ) {
      text = buffer.toString("gbk");
    }
  }
  return text;
}

const https = require("https");
const http = require("http");

const WEBHOOK_URL =
  "https://oapi.dingtalk.com/robot/send?access_token=a999bbee464d0c21493980cdacc6b096982b7f6b04218a34f69dfa61278feb00";

const WORK_NOTIFY_URL =
  "https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2";
const TOKEN_URL = "https://api.dingtalk.com/v1.0/oauth2/accessToken";

const DEFAULT_APP_KEY = "dingfztactakcnl0wkwd";
const DEFAULT_APP_SECRET =
  "gJx89RoiA_4iVHAJqRpJkSSgY2byjjTlPqRyIudDccZwTTC5c7UrTBP65HZvy-xP";
const DEFAULT_AGENT_ID = "3941085354";

async function getAccessToken(appKey, appSecret) {
  const body = JSON.stringify({
    appKey: appKey,
    appSecret: appSecret,
  });

  const urlObj = new URL(TOKEN_URL);
  const options = {
    hostname: urlObj.hostname,
    port: 443,
    path: urlObj.pathname,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const result = JSON.parse(data);
          if (result.accessToken) {
            resolve(result.accessToken);
          } else {
            reject(new Error("获取token失败: " + data));
          }
        } catch (e) {
          reject(new Error("Invalid response: " + data));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sendRequest(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const module = urlObj.protocol === "https:" ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = module.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("Invalid response: " + data));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function printUsage() {
  console.log(`
钉钉通知脚本

用法:
  node dingtalk-notify.js <类型> [参数...]

【群机器人通知】

类型:
  text <内容>                          发送文本消息
  markdown <标题>                      发送Markdown消息（使用 --file）
  link <标题> <描述> <链接>            发送链接消息
  actioncard <标题> <内容> <按钮文字> <按钮链接>  发送ActionCard消息

示例:
  node dingtalk-notify.js markdown '标题' --file content.md
  node dingtalk-notify.js link '标题' '描述' 'https://example.com'

【工作通知（个人消息）】

【获取 access_token】

类型:
  token

参数:
  --appkey <appKey>      应用的 appKey（必填）
  --secret <appSecret>   应用的 appSecret（必填）

示例:
  node dingtalk-notify.js token --appkey xxx --secret xxx

【工作通知（个人消息）】

类型:
  work

参数:
  --token <access_token>   应用access_token（与 appkey/secret 二选一）
  --appkey <appKey>        应用appKey（与 token 二选一）
  --secret <appSecret>     应用appSecret（与 appkey 配合使用）
  --agent <agent_id>      应用的AgentID（必填）
  --user <userid>         接收者userid（必填）
  --type <msgtype>        消息类型: text, markdown（必填）
  --title <标题>          标题（markdown必填）
  --content <内容>        消息内容（必填）

示例:
  node dingtalk-notify.js work --token xxx --agent 123456 --user user001 --type text --content "请提交日报"
  node dingtalk-notify.js work --appkey xxx --secret xxx --agent 123456 --user user001 --type markdown --title "工时提醒" --content "## 内容"
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    printUsage();
    process.exit(0);
  }

  const type = args[0].toLowerCase();

  // 获取 access_token
  if (type === "token") {
    let appKey, appSecret;

    for (let i = 1; i < args.length; i++) {
      if (args[i] === "--appkey" && args[i + 1]) {
        appKey = args[i + 1];
        i++;
      } else if (args[i] === "--secret" && args[i + 1]) {
        appSecret = args[i + 1];
        i++;
      }
    }

    if (!appKey || !appSecret) {
      console.error("错误: 获取 token 需要 --appkey 和 --secret 参数");
      process.exit(1);
    }

    try {
      const token = await getAccessToken(appKey, appSecret);
      console.log(token);
    } catch (error) {
      console.error("获取 token 失败:", error.message);
      process.exit(1);
    }
    return;
  }

  if (type === "work") {
    let accessToken,
      agentId,
      userId,
      msgType,
      title,
      content,
      appKey,
      appSecret;

    for (let i = 1; i < args.length; i++) {
      if (args[i] === "--token" && args[i + 1]) {
        accessToken = args[i + 1];
        i++;
      } else if (args[i] === "--appkey" && args[i + 1]) {
        appKey = args[i + 1];
        i++;
      } else if (args[i] === "--secret" && args[i + 1]) {
        appSecret = args[i + 1];
        i++;
      } else if (args[i] === "--agent" && args[i + 1]) {
        agentId = args[i + 1];
        i++;
      } else if (args[i] === "--user" && args[i + 1]) {
        userId = args[i + 1];
        i++;
      } else if (args[i] === "--type" && args[i + 1]) {
        msgType = args[i + 1];
        i++;
      } else if (args[i] === "--title" && args[i + 1]) {
        title = args[i + 1];
        i++;
      } else if (args[i] === "--file" && args[i + 1]) {
        // 支持从文件读取内容（--content 的替代方式）
        content = readFileContent(args[i + 1]);
        tempFiles.push(args[i + 1]);
        i++;
      } else if (args[i] === "--content" && args[i + 1]) {
        // 支持从 --file 读取内容
        if (args[i + 1] === "--file" && args[i + 2]) {
          content = readFileContent(args[i + 2]);
          tempFiles.push(args[i + 2]);
          i++;
        } else {
          content = args[i + 1];
        }
        i++;
      }
    }

    // 使用默认值
    appKey = appKey || DEFAULT_APP_KEY;
    appSecret = appSecret || DEFAULT_APP_SECRET;
    agentId = agentId || DEFAULT_AGENT_ID;

    // 如果提供了 appKey 和 appSecret，自动获取 token
    if (!accessToken && appKey && appSecret) {
      try {
        accessToken = await getAccessToken(appKey, appSecret);
      } catch (error) {
        console.error("获取 token 失败:", error.message);
        process.exit(1);
      }
    }

    if (!accessToken || !agentId || !userId || !msgType || !content) {
      console.error(
        "错误: 工作通知需要 (--token 或 --appkey+--secret) + --agent + --user + --type + --content 参数",
      );
      process.exit(1);
    }

    let msgContent = {};
    if (msgType === "text") {
      msgContent = { content: content };
    } else if (msgType === "markdown") {
      // 兼容 shell、cmd、powershell 的换行符：将字面的 \n 转为真正换行
      const markdownText = content.replace(/\\n/g, "\n");
      msgContent = { title: title || "", text: markdownText };
    } else {
      console.error("错误: 工作通知只支持 text 和 markdown 类型");
      process.exit(1);
    }

    const body = {
      agent_id: parseInt(agentId),
      userid_list: userId,
      msg: {
        msgtype: msgType,
        [msgType]: msgContent,
      },
    };

    const url = `${WORK_NOTIFY_URL}?access_token=${accessToken}`;

    try {
      const response = await sendRequest(url, JSON.stringify(body));
      if (response.errcode === 0) {
        console.log("工作通知发送成功, task_id:", response.task_id);
      } else {
        console.error(
          "工作通知发送失败:",
          response.errmsg,
          "(code:",
          response.errcode + ")",
        );
        process.exit(1);
      }
    } catch (error) {
      console.error("请求失败:", error.message);
      process.exit(1);
    } finally {
      cleanupTempFiles();
    }
    return;
  }

  let body = {};

  switch (type) {
    case "text":
      if (args.length < 2) {
        console.error("错误: text 类型需要提供内容");
        process.exit(1);
      }
      body = {
        msgtype: "text",
        text: { content: args[1] },
      };
      break;

    case "markdown":
      // 支持从 --file 读取内容
      const fileIndex = args.indexOf("--file");
      let markdownText = "";

      if (fileIndex > -1 && args[fileIndex + 1]) {
        const filePath = args[fileIndex + 1];
        markdownText = readFileContent(filePath);
        tempFiles.push(filePath);
      } else if (args.length >= 3) {
        // 处理转义字符：兼容 shell、cmd、powershell
        markdownText = args[2].replace(/\\n/g, "\n").replace(/\\\n/g, "\n");
      } else {
        console.error("错误: markdown 类型需要提供内容，或使用 --file 参数");
        process.exit(1);
      }

      body = {
        msgtype: "markdown",
        markdown: {
          title: args[1],
          text: markdownText,
        },
      };
      break;

    case "link":
      if (args.length < 4) {
        console.error("错误: link 类型需要提供标题、描述和链接");
        process.exit(1);
      }
      body = {
        msgtype: "link",
        link: {
          title: args[1],
          text: args[2],
          messageUrl: args[3],
        },
      };
      break;

    case "actioncard":
      if (args.length < 5) {
        console.error(
          "错误: actioncard 类型需要提供标题、内容、按钮文字和按钮链接",
        );
        process.exit(1);
      }
      body = {
        msgtype: "actionCard",
        actionCard: {
          title: args[1],
          text: args[2],
          singleTitle: args[3],
          singleURL: args[4],
        },
      };
      break;

    default:
      console.error("错误: 不支持的消息类型:", type);
      printUsage();
      process.exit(1);
  }

  try {
    const response = await sendRequest(WEBHOOK_URL, JSON.stringify(body));
    if (response.errcode === 0) {
      console.log("发送成功:", response.errmsg);
    } else {
      console.error(
        "发送失败:",
        response.errmsg,
        "(code:",
        response.errcode + ")",
      );
      process.exit(1);
    }
  } catch (error) {
    console.error("请求失败:", error.message);
    process.exit(1);
  } finally {
    cleanupTempFiles();
  }
}

main();
