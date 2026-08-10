import { z } from 'zod';
import {
  AI_MODES,
  APPROVAL_ACTION_TYPES,
  ORGANIZATION_TYPES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  THREAD_STATUSES,
} from './enums';
import { TASK_QUICK_FILTERS, TASK_SORT_FIELDS } from './filters';

/**
 * Schemi condivisi da form, API route e tool MCP: una sola definizione di
 * "input valido", validata sempre lato server.
 */

export const taskStatusSchema = z.enum(TASK_STATUSES);
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export const threadStatusSchema = z.enum(THREAD_STATUSES);
export const organizationTypeSchema = z.enum(ORGANIZATION_TYPES);
export const aiModeSchema = z.enum(AI_MODES);
export const approvalActionTypeSchema = z.enum(APPROVAL_ACTION_TYPES);

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

/** Data ISO `YYYY-MM-DD` oppure vuota. */
export const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data non valido (atteso AAAA-MM-GG)');

export const optionalIsoDateSchema = z
  .union([isoDateSchema, z.literal('')])
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

export const createTaskSchema = z.object({
  title: trimmed(300).min(3, 'Il titolo deve avere almeno 3 caratteri'),
  description: optionalText(10_000),
  status: taskStatusSchema.default('da_fare'),
  priority: taskPrioritySchema.default('media'),
  projectId: z.uuid().nullable().optional(),
  ownerId: z.uuid().nullable().optional(),
  dueDate: optionalIsoDateSchema,
  nextStep: optionalText(1_000),
  waitingOnThirdParty: z.boolean().default(false),
  waitingOn: optionalText(300),
  followUpDate: optionalIsoDateSchema,
  blockedReason: optionalText(1_000),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = createTaskSchema.partial().extend({
  id: z.uuid(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/** Modifica rapida da tabella o Kanban: solo i campi operativi. */
export const quickUpdateTaskSchema = z.object({
  id: z.uuid(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  nextStep: optionalText(1_000),
  dueDate: optionalIsoDateSchema,
});
export type QuickUpdateTaskInput = z.infer<typeof quickUpdateTaskSchema>;

export const bulkUpdateTaskSchema = z.object({
  ids: z.array(z.uuid()).min(1, 'Seleziona almeno un’attività').max(200),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
});
export type BulkUpdateTaskInput = z.infer<typeof bulkUpdateTaskSchema>;

export const taskFilterSchema = z.object({
  query: z.string().trim().max(200).optional(),
  status: z.array(taskStatusSchema).optional(),
  priority: z.array(taskPrioritySchema).optional(),
  projectId: z.array(z.string()).optional(),
  quick: z.array(z.enum(TASK_QUICK_FILTERS)).optional(),
  sort: z.enum(TASK_SORT_FIELDS).optional(),
  direction: z.enum(['asc', 'desc']).optional(),
});

export const savedViewSchema = z.object({
  name: trimmed(80).min(2, 'Il nome della vista deve avere almeno 2 caratteri'),
  filter: taskFilterSchema,
  layout: z.enum(['tabella', 'kanban']).default('tabella'),
});
export type SavedViewInput = z.infer<typeof savedViewSchema>;

export const linkThreadToTaskSchema = z.object({
  threadId: z.uuid(),
  taskId: z.uuid(),
});

export const threadStatusUpdateSchema = z.object({
  threadId: z.uuid(),
  status: threadStatusSchema,
});

export const createDraftSchema = z.object({
  threadId: z.uuid().nullable().optional(),
  taskId: z.uuid().nullable().optional(),
  instruction: trimmed(2_000).optional(),
});

export const approvalDecisionSchema = z.object({
  approvalId: z.uuid(),
  decision: z.enum(['approva', 'rifiuta']),
  note: optionalText(2_000),
});

export const assistantQuerySchema = z.object({
  question: trimmed(1_000).min(3, 'Scrivi almeno tre caratteri'),
});

/** Proposta di attività generata dall'AI o ricevuta via MCP. */
export const taskProposalSchema = z.object({
  title: trimmed(300).min(3),
  description: optionalText(5_000),
  priority: taskPrioritySchema.default('media'),
  dueDate: optionalIsoDateSchema,
  nextStep: optionalText(1_000),
  projectCode: optionalText(60),
  rationale: trimmed(2_000),
  confidence: z.number().min(0).max(1),
});
export type TaskProposal = z.infer<typeof taskProposalSchema>;

export const taskUpdateProposalSchema = z.object({
  taskCode: trimmed(20),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  nextStep: optionalText(1_000),
  dueDate: optionalIsoDateSchema,
  waitingOnThirdParty: z.boolean().optional(),
  rationale: trimmed(2_000),
});
export type TaskUpdateProposal = z.infer<typeof taskUpdateProposalSchema>;

export const settingsSchema = z.object({
  aiMode: aiModeSchema,
  openaiModel: trimmed(120).optional(),
  anthropicModel: trimmed(120).optional(),
  emailRetentionDays: z.coerce.number().int().min(0).max(3650),
  auditRetentionDays: z.coerce.number().int().min(30).max(3650),
  autoClassifyOnSync: z.boolean(),
  requireApprovalForTaskCreation: z.boolean(),
});
export type SettingsInput = z.infer<typeof settingsSchema>;
