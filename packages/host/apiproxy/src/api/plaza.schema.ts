/**
 * plaza domain zod schemas (names derived from map keys:
 * plazaListRequestSchema / plazaListValueSchema / plazaInstallRequestSchema /
 * plazaInstallValueSchema / plazaRefreshRequestSchema / plazaRefreshValueSchema).
 */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'
import type { PlazaSkillEntry } from './plaza.ts'

/** PlazaSkillEntry row of plaza.list. */
export const plazaSkillEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nameZh: z.string().optional(),
  description: z.string(),
  descriptionZh: z.string().optional(),
  repo: z.string().min(1),
  path: z.string().min(1),
  ref: z.string().min(1),
  stars: z.number().optional(),
  source: z.union([z.literal('curated'), z.literal('discovered')]),
  installed: z.boolean(),
}) satisfies z.ZodType<Wire<PlazaSkillEntry>>

/** plaza.list request payload (session-free). */
export const plazaListRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'plaza.list'>>>

/** plaza.list response value. */
export const plazaListValueSchema = z.object({
  skills: z.array(plazaSkillEntrySchema),
}) satisfies z.ZodType<Wire<ResponseValue<'plaza.list'>>>

/** plaza.install request payload. */
export const plazaInstallRequestSchema = z.object({
  id: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'plaza.install'>>>

/** plaza.install response value. */
export const plazaInstallValueSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
}) satisfies z.ZodType<Wire<ResponseValue<'plaza.install'>>>

/** plaza.refresh request payload (session-free). */
export const plazaRefreshRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'plaza.refresh'>>>

/** plaza.refresh response value. */
export const plazaRefreshValueSchema = z.object({
}) satisfies z.ZodType<Wire<ResponseValue<'plaza.refresh'>>>
