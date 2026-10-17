/** Human names for the language models behind readings (ADR-0010, ADR-0017). */
export function modelName(model: string | null | undefined): string | null {
  if (!model) return null;
  const id = model.replace(/^accounts\/[^/]+\/(models|routers)\//, '');
  if (id.startsWith('deepseek-v4p1-flash')) return 'DeepSeek V4.1 Flash';
  if (id.startsWith('claude-opus-5-5')) return 'Claude Opus 5.5';
  return id;
}
