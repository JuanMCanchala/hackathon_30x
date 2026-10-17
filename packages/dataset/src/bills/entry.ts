import type { DatasetBill, DocFormat } from '../types';

const MEDIA_TYPES: Record<DocFormat, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  eml: 'message/rfc822',
  txt: 'text/plain',
};

const FOLDERS: Record<string, string> = {
  ago: 'agosto',
  sep: 'septiembre',
  atk: 'ataques',
  vivo: 'en-vivo',
};

export function entry(
  spec: Omit<DatasetBill, 'file' | 'mediaType'> & { slug: string },
): DatasetBill {
  const { slug, ...rest } = spec;
  const prefix = spec.id.split('-')[0] ?? '';
  const folder = FOLDERS[prefix];
  if (!folder) throw new Error(`unknown id prefix ${spec.id}`);
  const format = spec.document.format;
  return {
    ...rest,
    file: `${folder}/${spec.id}-${slug}.${format}`,
    mediaType: MEDIA_TYPES[format],
  };
}
