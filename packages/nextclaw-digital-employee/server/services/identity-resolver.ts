import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { PLATFORM_TABLES, type ChannelGroupRecord } from "../db/schema";
import { dbNow } from "../db/knex";
import { createLogger } from "../utils/logger";

const log = createLogger("IdentityResolver");

export type ResolvedIdentity = {
  name: string;
  username?: string;
  department?: string;
  title?: string;
  externalId: string;
};

export type ResolvedGroup = {
  conversationId: string;
  title: string;
  accountId?: string;
};

export class IdentityResolver {
  constructor(private readonly db: Knex) {}

  async registerGroup(conversationId: string, title: string, accountId?: string): Promise<void> {
    if (!title || !conversationId) return;
    const existing = await this.db<ChannelGroupRecord>(PLATFORM_TABLES.channelGroups)
      .where({ conversation_id: conversationId })
      .first();
    if (existing) {
      if (existing.title !== title.trim() || (accountId && existing.account_id !== accountId)) {
        await this.db<ChannelGroupRecord>(PLATFORM_TABLES.channelGroups)
          .where({ id: existing.id })
          .update({
            title: title.trim(),
            account_id: accountId || existing.account_id,
            updated_at: dbNow(),
          });
      }
    } else {
      try {
        await this.db<ChannelGroupRecord>(PLATFORM_TABLES.channelGroups).insert({
          id: randomUUID(),
          conversation_id: conversationId,
          title: title.trim(),
          channel: "dingtalk",
          account_id: accountId || "",
          created_at: dbNow(),
          updated_at: dbNow(),
        });
      } catch (err: unknown) {
        const code = (err as { code?: string }).code;
        if (code === "SQLITE_CONSTRAINT" || code === "23505") {
          log.info(`registerGroup: duplicate conversation_id=${conversationId}, skipping`);
        } else {
          throw err;
        }
      }
    }
  }

  async resolveGroupByName(name: string): Promise<ResolvedGroup | null> {
    const trimmed = name.trim();
    const lower = trimmed.toLowerCase();

    const exact = await this.db<ChannelGroupRecord>(PLATFORM_TABLES.channelGroups)
      .whereRaw("LOWER(title) = ?", [lower])
      .first();
    if (exact) {
      log.info(`resolveGroupByName name=${JSON.stringify(name)} → ${exact.conversation_id}`);
      return { conversationId: exact.conversation_id, title: exact.title, accountId: exact.account_id || undefined };
    }

    const escaped = lower.replace(/[%_]/g, (ch) => `\\${ch}`);
    const partial = await this.db<ChannelGroupRecord>(PLATFORM_TABLES.channelGroups)
      .whereRaw("LOWER(title) LIKE ? ESCAPE '\\'", [`%${escaped}%`])
      .first();
    if (partial) {
      log.info(`resolveGroupByName name=${JSON.stringify(name)} (partial) → ${partial.conversation_id}`);
      return { conversationId: partial.conversation_id, title: partial.title, accountId: partial.account_id || undefined };
    }

    log.info(`resolveGroupByName name=${JSON.stringify(name)} → not found`);
    return null;
  }

  async listKnownGroups(): Promise<ResolvedGroup[]> {
    const rows = await this.db<ChannelGroupRecord>(PLATFORM_TABLES.channelGroups).select("*");
    return rows.map((r) => ({
      conversationId: r.conversation_id,
      title: r.title,
      accountId: r.account_id || undefined,
    }));
  }

  static buildSenderPrefix(
    identity: ResolvedIdentity | null,
    senderId: string,
    fallbackName?: string
  ): string {
    const displayName = identity?.name ?? (fallbackName || senderId);
    const username = identity?.username?.trim();
    const usernamePart = username ? `, 用户名:${username}` : "";
    const deptTitle = identity
      ? `${identity.department ? `, ${identity.department}` : ""}${identity.title ? `/${identity.title}` : ""}`
      : "";
    return `[发送者: ${displayName} (ID:${senderId}${usernamePart}${deptTitle})]`;
  }

  private async resolveUsernameByHumanEmployees(senderId: string): Promise<string | undefined> {
    const row = await this.db(PLATFORM_TABLES.users)
      .where(`${PLATFORM_TABLES.users}.human_employee_id`, senderId)
      .where(`${PLATFORM_TABLES.users}.is_active`, 1)
      .select(`${PLATFORM_TABLES.users}.username`)
      .first<{ username?: string }>();

    return row?.username?.trim() || undefined;
  }

  async resolve(senderId: string): Promise<ResolvedIdentity | null> {
    const row = await this.db(PLATFORM_TABLES.humanEmployees)
      .leftJoin(
        PLATFORM_TABLES.departments,
        `${PLATFORM_TABLES.humanEmployees}.department_id`,
        `${PLATFORM_TABLES.departments}.id`
      )
      .where(`${PLATFORM_TABLES.humanEmployees}.external_id`, senderId)
      .select(
        `${PLATFORM_TABLES.humanEmployees}.id`,
        `${PLATFORM_TABLES.humanEmployees}.name`,
        `${PLATFORM_TABLES.humanEmployees}.title`,
        `${PLATFORM_TABLES.humanEmployees}.external_id`,
        `${PLATFORM_TABLES.departments}.name as dept_name`
      )
      .first();

    const username = await this.resolveUsernameByHumanEmployees(row.id);
    if (row) {
      return {
        name: row.name,
        username,
        department: row.dept_name || undefined,
        title: row.title || undefined,
        externalId: row.external_id,
      };
    }

    const userRow = await this.db(PLATFORM_TABLES.users)
      .leftJoin(
        PLATFORM_TABLES.departments,
        `${PLATFORM_TABLES.users}.department_id`,
        `${PLATFORM_TABLES.departments}.id`
      )
      .where(`${PLATFORM_TABLES.users}.external_dingtalk_id`, senderId)
      .where(`${PLATFORM_TABLES.users}.is_active`, 1)
      .select(
        `${PLATFORM_TABLES.users}.display_name as name`,
        `${PLATFORM_TABLES.users}.username`,
        `${PLATFORM_TABLES.users}.external_post_name as title`,
        `${PLATFORM_TABLES.users}.external_dingtalk_id as external_id`,
        `${PLATFORM_TABLES.departments}.name as dept_name`
      )
      .first();

    if (!userRow) return null;

    return {
      name: userRow.name,
      username: userRow.username || username,
      department: userRow.dept_name || undefined,
      title: userRow.title || undefined,
      externalId: userRow.external_id,
    };
  }

  async resolveByInternalId(userId: string): Promise<ResolvedIdentity | null> {
    const row = await this.db(PLATFORM_TABLES.users)
      .leftJoin(
        PLATFORM_TABLES.departments,
        `${PLATFORM_TABLES.users}.department_id`,
        `${PLATFORM_TABLES.departments}.id`
      )
      .where(`${PLATFORM_TABLES.users}.id`, userId)
      .select(
        `${PLATFORM_TABLES.users}.display_name as name`,
        `${PLATFORM_TABLES.users}.username`,
        `${PLATFORM_TABLES.users}.external_post_name as title`,
        `${PLATFORM_TABLES.users}.external_dingtalk_id as external_id`,
        `${PLATFORM_TABLES.departments}.name as dept_name`
      )
      .first();

    if (!row) return null;

    return {
      name: row.name || userId,
      username: row.username || undefined,
      department: row.dept_name || undefined,
      title: row.title || undefined,
      externalId: row.external_id || userId,
    };
  }

  async resolveByName(name: string): Promise<ResolvedIdentity[]> {
    const trimmed = name.trim();

    const humanQuery = () =>
      this.db(PLATFORM_TABLES.humanEmployees)
        .leftJoin(
          PLATFORM_TABLES.departments,
          `${PLATFORM_TABLES.humanEmployees}.department_id`,
          `${PLATFORM_TABLES.departments}.id`
        )
        .select(
          `${PLATFORM_TABLES.humanEmployees}.name`,
          `${PLATFORM_TABLES.humanEmployees}.title`,
          this.db.raw("NULL as username"),
          `${PLATFORM_TABLES.humanEmployees}.external_id`,
          `${PLATFORM_TABLES.departments}.name as dept_name`
        );

    let rows = await humanQuery().where(`${PLATFORM_TABLES.humanEmployees}.name`, trimmed);

    if (rows.length === 0) {
      rows = await humanQuery().whereRaw(
        `TRIM(${PLATFORM_TABLES.humanEmployees}.name) = ?`,
        [trimmed]
      );
    }

    if (rows.length === 0) {
      const userRows = await this.db(PLATFORM_TABLES.users)
        .leftJoin(
          PLATFORM_TABLES.departments,
          `${PLATFORM_TABLES.users}.department_id`,
          `${PLATFORM_TABLES.departments}.id`
        )
        .where((builder) => {
          builder
            .where(`${PLATFORM_TABLES.users}.display_name`, trimmed)
            .orWhere(`${PLATFORM_TABLES.users}.external_name`, trimmed);
        })
        .where(`${PLATFORM_TABLES.users}.is_active`, 1)
        .select(
          `${PLATFORM_TABLES.users}.display_name as name`,
          `${PLATFORM_TABLES.users}.username`,
          `${PLATFORM_TABLES.users}.external_post_name as title`,
          `${PLATFORM_TABLES.users}.external_dingtalk_id as external_id`,
          `${PLATFORM_TABLES.departments}.name as dept_name`
        );

      rows = userRows.filter((r) => r.external_id);
    }

    log.info(`resolveByName name=${JSON.stringify(trimmed)} results=${rows.length}`);

    return rows.map((row) => ({
      name: row.name,
      username: row.username || undefined,
      department: row.dept_name || undefined,
      title: row.title || undefined,
      externalId: row.external_id,
    }));
  }
}
