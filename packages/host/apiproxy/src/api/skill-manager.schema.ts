/**
 * skillManager domain zod schemas (names derived from map keys:
 * skillManagerListRequestSchema / skillManagerListValueSchema /
 * skillManagerSetEnabledRequestSchema / skillManagerSetEnabledValueSchema).
 */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'
import type { SkillManagerEntry } from './skill-manager.ts'

/** SkillManagerEntry row of skillManager.list. */
export const skillManagerEntrySchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  whenToUse: z.string().optional(),
  modelInvocable: z.boolean(),
  userInvocable: z.boolean(),
  source: z.string(),
  provider: z.string(),
  disabled: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}) satisfies z.ZodType<Wire<SkillManagerEntry>>

/** skillManager.list request payload (session-free). */
export const skillManagerListRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'skillManager.list'>>>

/** skillManager.list response value. */
export const skillManagerListValueSchema = z.object({
  skills: z.array(skillManagerEntrySchema),
}) satisfies z.ZodType<Wire<ResponseValue<'skillManager.list'>>>

/** skillManager.setEnabled request payload. */
export const skillManagerSetEnabledRequestSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean(),
}) satisfies z.ZodType<Wire<RequestPayload<'skillManager.setEnabled'>>>

/** skillManager.setEnabled response value. */
export const skillManagerSetEnabledValueSchema = z.object({
}) satisfies z.ZodType<Wire<ResponseValue<'skillManager.setEnabled'>>>
