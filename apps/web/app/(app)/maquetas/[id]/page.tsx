'use client';

/**
 * The maqueta editor: the slides on the left, the selected one big in the middle, and on the right
 * its text, the look, the brand and the canvas. It saves only on «Guardar» (or ⌘S), downloads
 * PNG, schedules the maqueta on the calendar and reuses its design for another topic.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import {
  AlignCenter,
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  CopyPlus,
  Download,
  Loader2,
  Lock,
  PenLine,
  Plus,
  Repeat2,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  memo,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';
import {
  FORMAT_SPEC,
  FORMATS_ORDER,
  LAYOUT_COPY,
  LAYOUTS_ORDER,
  MaquetaExportStage,
  MaquetaSlideView,
  PRESETS,
  downloadSlides,
  maquetaName,
  maquetaText,
  styleFrom,
} from '@/components/maqueta';
import {
  ColorField,
  GroupLabel,
  Section,
  Segmented,
  Switch,
  TextField,
  contrast,
} from '@/components/maqueta-inspector';
import {
  FormatGlyph,
  LIMITS,
  ReuseDialog,
  agoText,
  blankSlides,
  brandFrom,
  cleanInput,
  listWith,
  originHref,
  originLabel,
  sameMaqueta,
  slidesCount,
  useFreshMaqueta,
  useNow,
} from '@/components/maqueta-kit';
import { ScheduleDialog } from '@/components/schedule-dialog';
import { Button, Dialog, Empty, Skeleton, Tip } from '@/components/ui';
import { ApiError, post, put } from '@/lib/api';
import type {
  Maqueta,
  MaquetaFormat,
  MaquetaInput,
  MaquetaLayout,
  MaquetaSlide,
  MaquetaStyle,
} from '@/lib/types';
import { useProfile } from '@/lib/workspace';

// ------------------------------------------------------------------ copy

const LABELS: Record<MaquetaLayout, { kicker: string | null; title: string; body: string }> = {
  portada: { kicker: 'Antetítulo', title: 'Titular', body: 'Bajada' },
  titular: { kicker: 'Antetítulo', title: 'Titular', body: 'Texto' },
  cifra: { kicker: 'Cifra', title: 'Titular', body: 'Texto' },
  cita: { kicker: null, title: 'Cita', body: 'Quién lo dice' },
  lista: { kicker: 'Antetítulo', title: 'Titular', body: 'Puntos, uno por línea' },
  cierre: { kicker: 'Antetítulo', title: 'Llamado a la acción', body: 'Texto' },
};

/** When the drawing shrinks the type or cuts a line, say so under the field. */
function kickerNote(layout: MaquetaLayout, kicker: string): string | null {
  if (layout === 'cifra')
    return kicker.trim().length > 8
      ? 'Con más de 8 caracteres la cifra se ve más chica.'
      : 'El número protagonista, por ejemplo «73 %» o «3x».';
  return kicker.trim().length > 36 ? 'Largo: el antetítulo se corta en una línea.' : null;
}

function titleNote(layout: MaquetaLayout, title: string, handle: string): string | null {
  const n = title.trim().length;
  if (layout === 'portada')
    return n > 95
      ? 'Largo para una portada: la letra se achica. Hasta 55 caracteres se ve grande.'
      : null;
  if (layout === 'cita') return n > 130 ? 'Cita larga: la letra se achica.' : null;
  if (layout === 'cierre' && handle)
    return `Debajo va el botón «Síguenos en ${handle}» (sale de la marca).`;
  return n > 85 ? 'Largo: la letra se achica. Hasta 45 caracteres se lee de un vistazo.' : null;
}

function bodyNote(layout: MaquetaLayout, body: string): string | null {
  if (layout === 'lista') {
    const lines = body.split('\n').filter((l) => l.trim()).length;
    return lines > 7
      ? `Se ven los primeros 7 puntos de ${lines}.`
      : 'Un punto por línea; se ven hasta 7.';
  }
  return body.length > 170 ? 'Más de 170 caracteres: el texto se achica.' : null;
}

const sameLook = (a: MaquetaStyle, b: MaquetaStyle) =>
  a.bg === b.bg &&
  a.ink === b.ink &&
  a.accent === b.accent &&
  a.soft === b.soft &&
  a.font === b.font &&
  a.headline === b.headline &&
  a.align === b.align &&
  a.texture === b.texture;

const copyName = (name: string) => `${name.slice(0, LIMITS.name - 9)} (copia)`;

// ------------------------------------------------------------------ small pieces

const outline =
  'inline-flex h-10 items-center gap-2 rounded-[10px] border border-rule-strong bg-sheet px-3.5 text-[0.88rem] font-[650] whitespace-nowrap text-ink transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-50';

const menuItem =
  'flex cursor-pointer items-center justify-between gap-3 rounded-[8px] px-3 py-2 text-[0.88rem] text-ink outline-none data-[highlighted]:bg-fill';

const WIDE = '(min-width: 1024px)';
const subscribeWide = (cb: () => void) => {
  const m = window.matchMedia(WIDE);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};
const useWide = () =>
  useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => true,
  );

/** The slide kept selected when a demo maqueta's copy opens in its place. */
let carried: { id: string; sel: number } | null = null;

const Thumb = memo(function Thumb(props: {
  format: MaquetaFormat;
  style: MaquetaStyle;
  slide: MaquetaSlide;
  index: number;
  total: number;
}) {
  return <MaquetaSlideView {...props} />;
});

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <Tip content={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className={clsx(
          'grid size-10 place-items-center rounded-[9px] border border-rule bg-sheet transition hover:border-rule-strong disabled:cursor-not-allowed disabled:opacity-40 lg:size-9 [&_svg]:size-4',
          danger ? 'text-held hover:bg-held-tint' : 'text-ink',
        )}
      >
        {children}
      </button>
    </Tip>
  );
}

function DownloadButton({
  several,
  index,
  total,
  size,
  exporting,
  onExport,
}: {
  several: boolean;
  index: number;
  total: number;
  size: string;
  exporting: { done: number; total: number } | null;
  onExport: (only: number | null) => void;
}) {
  const busy = exporting !== null;
  const content = (
    <>
      {busy ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Download className="size-4" aria-hidden />
      )}
      {busy
        ? exporting.total > 1
          ? `Descargando ${exporting.done + 1} de ${exporting.total}…`
          : 'Descargando…'
        : 'Descargar PNG'}
    </>
  );
  if (!several)
    return (
      <button type="button" onClick={() => onExport(0)} disabled={busy} className={outline}>
        {content}
      </button>
    );
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" disabled={busy} className={outline}>
          {content}
          <ChevronDown className="size-3.5 text-ink-2" aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[260px] rounded-[12px] border border-rule bg-sheet p-1 shadow-float"
        >
          <DropdownMenu.Item onSelect={() => onExport(index)} className={menuItem}>
            <span className="font-[650]">Esta lámina</span>
            <span className="text-[0.8rem] text-ink-3">
              {index + 1} de {total}
            </span>
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => onExport(null)} className={menuItem}>
            <span className="font-[650]">Todas las láminas</span>
            <span className="text-[0.8rem] text-ink-3">{total} imágenes</span>
          </DropdownMenu.Item>
          <p className="px-3 pt-1.5 pb-2 text-[0.76rem] text-ink-3">
            PNG de {size} px, una imagen por lámina.
          </p>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ------------------------------------------------------------------ page

export default function MaquetaEditorPage() {
  const { id } = useParams<{ id: string }>();
  // Straight from the API: a cached copy could be older than the last save.
  const fresh = useFreshMaqueta(id);
  const data = fresh?.data;
  const error = fresh?.error;
  if (error && !data)
    return (
      <div className="mx-auto grid w-full max-w-[1180px] gap-5">
        <nav aria-label="Ruta" className="flex items-center gap-1.5 text-[0.84rem]">
          <Link href="/calendario" className="text-brand hover:underline">
            Planear
          </Link>
          <span className="text-ink-3" aria-hidden>
            ›
          </span>
          <Link href="/maquetas" className="text-brand hover:underline">
            Maquetas
          </Link>
        </nav>
        <Empty
          title="No encontramos esta maqueta"
          action={
            <Link href="/maquetas" className="font-[650] text-brand hover:underline">
              Ver las maquetas del equipo
            </Link>
          }
        >
          {error.message}
        </Empty>
      </div>
    );
  if (!data)
    return (
      <div className="mx-auto grid w-full max-w-[1480px] gap-5" aria-busy>
        <div className="grid gap-2">
          <Skeleton className="h-4 w-48 rounded-[6px]" />
          <Skeleton className="h-9 w-80 rounded-[8px]" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_288px] xl:grid-cols-[116px_minmax(0,1fr)_340px] xl:gap-5">
          <div className="hidden content-start gap-2.5 xl:grid">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-[4/5] rounded-[9px]" />
            ))}
          </div>
          <Skeleton className="h-[60dvh] lg:h-[calc(100dvh-290px)]" />
          <div className="grid content-start gap-3">
            <Skeleton className="h-72" />
            <Skeleton className="h-80" />
          </div>
        </div>
      </div>
    );
  return <Editor initial={data} />;
}

type SectionId = 'lamina' | 'estilo' | 'marca' | 'formato';

function Editor({ initial }: { initial: Maqueta }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [profile] = useProfile();
  const wide = useWide();
  const now = useNow();

  const [saved, setSaved] = useState<Maqueta>(initial);
  const [doc, setDoc] = useState<MaquetaInput>(() => {
    const clean = cleanInput(initial);
    return clean.slides.length ? clean : { ...clean, slides: blankSlides(clean.format) };
  });
  const [sel, setSel] = useState(() => (carried?.id === initial.id ? carried.sel : 0));
  const [stash, setStash] = useState<MaquetaSlide[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [reuseOpen, setReuseOpen] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [copyToOpen, setCopyToOpen] = useState<string | null>(null);
  const [sections, setSections] = useState<Partial<Record<SectionId, boolean>>>({});
  const stageRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLOListElement | null>(null);
  const stripRef = useRef<HTMLOListElement | null>(null);

  const spec = FORMAT_SPEC[doc.format];
  const total = doc.slides.length;
  const index = Math.min(sel, total - 1);
  const slide = doc.slides[index]!;
  const labels = LABELS[slide.layout];
  const brand = doc.style.brand;
  const profileBrand = useMemo(() => brandFrom(profile), [profile]);
  const dirty = useMemo(() => !sameMaqueta(doc, saved), [doc, saved]);
  const demo = !saved.removable;
  const canAdd = spec.multi && total < LIMITS.slides;
  const ratio = spec.width / spec.height;
  const deferredSlide = useDeferredValue(slide);
  const deferredStyle = useDeferredValue(doc.style);
  const preset = PRESETS.find((p) => sameLook(styleFrom(p.id, brand), doc.style));
  const base = PRESETS.find((p) => p.id === doc.style.preset);
  const fromHref = originHref(doc.origin);
  const what = doc.name.toLowerCase().includes(spec.label.toLowerCase())
    ? doc.name
    : `${spec.label} · ${doc.name}`;

  // ---------------------------------------------------------------- edits

  const patchSlide = (patch: Partial<MaquetaSlide>) =>
    setDoc((d) => ({
      ...d,
      slides: d.slides.map((s, k) => (k === index ? { ...s, ...patch } : s)),
    }));
  const patchStyle = (patch: Partial<MaquetaStyle>) =>
    setDoc((d) => ({ ...d, style: { ...d.style, ...patch } }));
  const patchBrand = (patch: Partial<MaquetaStyle['brand']>) =>
    setDoc((d) => ({ ...d, style: { ...d.style, brand: { ...d.style.brand, ...patch } } }));
  const applyPreset = (id: string) =>
    setDoc((d) => ({ ...d, style: styleFrom(id, d.style.brand) }));

  const insertAt = (at: number, s: MaquetaSlide) => {
    setDoc((d) => {
      const slides = [...d.slides];
      slides.splice(at, 0, s);
      return { ...d, slides };
    });
    setSel(at);
  };
  const addAfter = () => {
    if (canAdd)
      insertAt(index + 1, {
        layout: 'titular',
        kicker: '',
        title: 'Nueva idea',
        body: 'Cuéntala en dos o tres frases cortas.',
      });
  };
  const duplicate = () => {
    if (canAdd) insertAt(index + 1, { ...slide });
  };
  const removeSlide = () => {
    if (total <= 1) return;
    const at = index;
    const removed = slide;
    setDoc((d) => ({ ...d, slides: d.slides.filter((_, k) => k !== at) }));
    setSel(Math.max(0, at - 1));
    toast(`Borraste la lámina ${at + 1}`, {
      action: { label: 'Deshacer', onClick: () => insertAt(at, removed) },
    });
  };
  const move = (dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= total) return;
    setDoc((d) => {
      const slides = [...d.slides];
      const [s] = slides.splice(index, 1);
      slides.splice(to, 0, s!);
      return { ...d, slides };
    });
    setSel(to);
  };

  const switchFormat = (f: MaquetaFormat) => {
    if (f === doc.format) return;
    const next = FORMAT_SPEC[f];
    const rename = (d: MaquetaInput) =>
      d.name === maquetaName(d.origin, d.format) ? maquetaName(d.origin, f) : d.name;
    if (!next.multi && total > 1) {
      const rest = doc.slides.slice(1);
      setStash(rest);
      setDoc((d) => ({ ...d, name: rename(d), format: f, slides: d.slides.slice(0, 1) }));
      setSel(0);
      return;
    }
    if (next.multi && stash && total === 1) {
      const back = stash;
      setDoc((d) => ({ ...d, name: rename(d), format: f, slides: [...d.slides, ...back] }));
      setStash(null);
      return;
    }
    setDoc((d) => ({ ...d, name: rename(d), format: f }));
  };

  const discard = () => {
    setDoc(cleanInput(saved));
    setStash(null);
    setSel((s) => Math.min(s, saved.slides.length - 1));
    toast('Volviste a la versión guardada');
  };

  // ---------------------------------------------------------------- saving

  /**
   * Saves and returns the id that holds the design now: this maqueta, or the copy of a demo one.
   * A copy opens in place of the demo maqueta unless `stay` (a dialog still needs this screen).
   */
  const save = async (stay = false): Promise<string | null> => {
    if (saving) return null;
    if (!dirty) return saved.id;
    setSaving(true);
    const input = cleanInput(doc);
    try {
      if (demo) {
        const copy = await post<Maqueta>('/api/v1/maquetas', {
          ...input,
          name: copyName(input.name),
          basedOn: saved.id,
        });
        setSaved(copy);
        setDoc((d) => ({ ...d, name: copy.name, basedOn: copy.basedOn }));
        void mutate('/api/v1/maquetas', listWith(copy));
        toast('Guardamos tu copia', {
          description: 'La maqueta de la demo no cambia; desde ahora editas la tuya.',
        });
        carried = { id: copy.id, sel: index };
        if (stay) setCopyToOpen(copy.id);
        else router.replace(`/maquetas/${copy.id}`);
        return copy.id;
      }
      const next = await put<Maqueta>(`/api/v1/maquetas/${saved.id}`, input);
      setSaved(next);
      void mutate('/api/v1/maquetas', listWith(next));
      return next.id;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar. Intenta de nuevo.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const schedule = async () => {
    if (dirty && !(await save(true))) return;
    setScheduleOpen(true);
  };

  const reuseFor = async (topicId: string) => {
    const id = dirty ? await save(true) : saved.id;
    if (!id) return;
    router.push(
      `/maquetas/nueva?tema=${encodeURIComponent(topicId)}&desde=${encodeURIComponent(id)}`,
    );
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(maquetaText(doc));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('No se pudo copiar el texto.');
    }
  };

  const runExport = async (only: number | null) => {
    const list = only === null ? doc.slides.map((_, i) => i) : [only];
    setExporting({ done: 0, total: list.length });
    try {
      for (let tries = 0; !stageRef.current && tries < 30; tries++)
        await new Promise((r) => requestAnimationFrame(r));
      await document.fonts.ready;
      const stage = stageRef.current;
      if (!stage) throw new Error('No export stage');
      for (let k = 0; k < list.length; k++) {
        setExporting({ done: k, total: list.length });
        await downloadSlides(stage, doc.name, list[k]);
      }
      toast(list.length === 1 ? 'Descargaste la lámina' : `Descargaste ${list.length} láminas`, {
        description: `PNG de ${spec.width} × ${spec.height} px.`,
      });
    } catch {
      toast.error('No se pudo descargar. Intenta de nuevo.');
    } finally {
      setExporting(null);
    }
  };

  // ---------------------------------------------------------------- keyboard and leaving

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && !saving) void save();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
          el.closest('[role="radiogroup"],[role="dialog"],[role="menu"]'))
      )
        return;
      if ((e.key === 'ArrowLeft' || e.key === 'PageUp') && index > 0) {
        e.preventDefault();
        setSel(index - 1);
      } else if ((e.key === 'ArrowRight' || e.key === 'PageDown') && index < total - 1) {
        e.preventDefault();
        setSel(index + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    // A link inside the app (the sidebar, the breadcrumb) asks first instead of dropping changes.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!(a instanceof HTMLAnchorElement) || a.target === '_blank' || a.hasAttribute('download'))
        return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname)
        return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTo(`${url.pathname}${url.search}${url.hash}`);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  // Keep the selected thumbnail in view in the rail and in the phone's strip.
  useEffect(() => {
    for (const list of [railRef.current, stripRef.current]) {
      const item = list?.querySelector<HTMLElement>(`[data-thumb="${index}"]`);
      if (!list || !item || !list.offsetParent) continue;
      const box = list.getBoundingClientRect();
      const it = item.getBoundingClientRect();
      if (it.top < box.top || it.bottom > box.bottom)
        list.scrollBy({ top: it.top - box.top - (box.height - it.height) / 2, behavior: 'smooth' });
      if (it.left < box.left || it.right > box.right)
        list.scrollBy({
          left: it.left - box.left - (box.width - it.width) / 2,
          behavior: 'smooth',
        });
    }
  }, [index, total]);

  // ---------------------------------------------------------------- view

  const isOpen = (s: SectionId) => sections[s] ?? (wide || s === 'lamina');
  const toggle = (s: SectionId) => setSections((o) => ({ ...o, [s]: !isOpen(s) }));

  const saveButton = (className?: string) =>
    dirty || saving ? (
      <Button
        variant="primary"
        loading={saving}
        onClick={() => void save()}
        title={demo ? 'Es parte de la demo: guárdala como copia' : 'Guardar (Ctrl o ⌘ + S)'}
        className={clsx('min-w-[128px] rounded-[10px]!', className)}
      >
        {saving ? 'Guardando…' : demo ? 'Guardar copia' : 'Guardar'}
      </Button>
    ) : (
      <Button
        disabled
        icon={<Check className="size-4" aria-hidden />}
        className={clsx(
          'min-w-[128px] rounded-[10px]! disabled:cursor-default disabled:opacity-100',
          className,
        )}
      >
        Guardado
      </Button>
    );

  const scheduleButton = (className?: string) => (
    <button
      type="button"
      onClick={() => void schedule()}
      disabled={saving}
      className={clsx(
        'inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-ink px-4 text-[0.94rem] font-[650] whitespace-nowrap text-sheet transition hover:opacity-90 disabled:opacity-50',
        className,
      )}
    >
      <CalendarPlus className="size-4" aria-hidden />
      Programar
    </button>
  );

  const thumbButton = (s: MaquetaSlide, i: number) => (
    <button
      type="button"
      onClick={() => setSel(i)}
      aria-label={`Lámina ${i + 1}: ${s.title.trim() || LAYOUT_COPY[s.layout].label}`}
      aria-current={i === index ? 'true' : undefined}
      className={clsx(
        'relative block w-full rounded-[9px] p-[3px] transition',
        i === index ? 'bg-sheet ring-2 ring-marker' : 'ring-1 ring-rule hover:ring-rule-strong',
      )}
    >
      <Thumb format={doc.format} style={doc.style} slide={s} index={i} total={total} />
      <span
        className="absolute top-1.5 left-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ink/85 px-1 font-mono text-[0.62rem] font-[700] text-sheet"
        aria-hidden
      >
        {i + 1}
      </span>
    </button>
  );

  const addTile = (
    <button
      type="button"
      onClick={addAfter}
      disabled={!canAdd}
      title={
        canAdd ? 'Añadir una lámina después de la seleccionada' : `Hasta ${LIMITS.slides} láminas`
      }
      className="grid w-full place-items-center gap-1 rounded-[9px] border border-dashed border-rule-strong text-[0.74rem] font-[650] text-ink-2 transition hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      style={{ aspectRatio: `${spec.width} / ${spec.height}` }}
    >
      <span className="grid justify-items-center gap-0.5">
        <Plus className="size-4" aria-hidden />
        Añadir
      </span>
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-[1480px] pb-24 lg:pb-0">
      {/* ------------------------------------------------ header */}
      <header className="grid gap-3">
        <h1 className="sr-only">Editor de la maqueta {doc.name.trim() || 'sin nombre'}</h1>
        <nav aria-label="Ruta" className="flex min-w-0 items-center gap-1.5 text-[0.84rem]">
          <Link href="/calendario" className="text-brand hover:underline">
            Planear
          </Link>
          <span className="text-ink-3" aria-hidden>
            ›
          </span>
          <Link href="/maquetas" className="text-brand hover:underline">
            Maquetas
          </Link>
          <span className="text-ink-3" aria-hidden>
            ›
          </span>
          <span className="min-w-0 truncate text-ink-2">{doc.name.trim() || 'Sin nombre'}</span>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 basis-[240px]">
            {/* The name sizes to its text (an invisible copy sets the width), the pencil right after. */}
            <div className="group -mx-1.5 flex min-w-0 items-center gap-1">
              <div className="grid min-w-0 grid-cols-[minmax(0,auto)] *:[grid-area:1/1]">
                <span
                  aria-hidden
                  className="invisible overflow-hidden border border-transparent py-0.5 pr-2.5 pl-1.5 text-[1.5rem] leading-tight font-[700] tracking-[-0.02em] whitespace-pre"
                >
                  {doc.name || 'Sin nombre'}
                </span>
                <input
                  aria-label="Nombre de la maqueta"
                  value={doc.name}
                  placeholder="Sin nombre"
                  maxLength={LIMITS.name}
                  onChange={(e) => setDoc((d) => ({ ...d, name: e.target.value }))}
                  className="w-full min-w-0 truncate rounded-[8px] border border-transparent bg-transparent py-0.5 pr-1.5 pl-1.5 text-[1.5rem] leading-tight font-[700] tracking-[-0.02em] text-ink transition outline-none placeholder:text-ink-3 hover:border-rule focus:border-brand focus:bg-sheet focus:ring-4 focus:ring-brand/15"
                />
              </div>
              <PenLine
                className="size-4 shrink-0 text-ink-3 transition group-focus-within:opacity-0"
                aria-hidden
              />
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.84rem] text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <FormatGlyph format={doc.format} size={16} />
                {spec.label} · {slidesCount(total)}
              </span>
              <span aria-hidden className="text-ink-3">
                ·
              </span>
              {fromHref ? (
                <Link href={fromHref} className="hover:text-brand hover:underline">
                  {originLabel(doc.origin)}
                </Link>
              ) : (
                <span>{originLabel(doc.origin)}</span>
              )}
              <span aria-hidden className="text-ink-3">
                ·
              </span>
              <span role="status" className="inline-flex items-center gap-1.5">
                {saving ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    Guardando…
                  </>
                ) : dirty ? (
                  <>
                    <span className="size-2 rounded-full bg-marker" aria-hidden />
                    <span className="font-[650] text-ink">Cambios sin guardar</span>
                    <button
                      type="button"
                      onClick={discard}
                      className="font-[600] text-ink-2 underline underline-offset-2 hover:text-ink"
                    >
                      Descartar
                    </button>
                  </>
                ) : (
                  <>Guardada {agoText(saved.updatedAt, now)}</>
                )}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void copyText()} className={outline}>
              {copied ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <Copy className="size-4" aria-hidden />
              )}
              {copied ? 'Copiado' : 'Copiar texto'}
            </button>
            <DownloadButton
              several={spec.multi && total > 1}
              index={index}
              total={total}
              size={`${spec.width} × ${spec.height}`}
              exporting={exporting}
              onExport={(only) => void runExport(only)}
            />
            <button type="button" onClick={() => setReuseOpen(true)} className={outline}>
              <Repeat2 className="size-4" aria-hidden />
              Usar para otro post
            </button>
            <span className="hidden items-center gap-2 lg:flex">
              {scheduleButton()}
              {saveButton()}
            </span>
          </div>
        </div>
        {demo && (
          <p className="inline-flex w-fit items-center gap-2 rounded-[10px] bg-pending-tint px-3 py-1.5 text-[0.84rem] text-ink">
            <Lock className="size-4 shrink-0 text-pending" aria-hidden />
            Es parte de la demo: guárdala como copia. La original no cambia.
          </p>
        )}
      </header>

      {/* ------------------------------------------------ workspace */}
      {/* Below xl the slides go in the strip under the canvas, so the canvas keeps its width. */}
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_288px] xl:grid-cols-[116px_minmax(0,1fr)_340px] xl:gap-5">
        <nav
          aria-label="Láminas"
          className="hidden xl:sticky xl:top-[72px] xl:flex xl:max-h-[calc(100dvh-92px)] xl:flex-col xl:gap-2 xl:self-start"
        >
          <ol ref={railRef} className="grid min-h-0 content-start gap-2 overflow-y-auto p-1">
            {doc.slides.map((s, i) => (
              <li key={i} data-thumb={i}>
                {thumbButton(s, i)}
              </li>
            ))}
          </ol>
          {spec.multi && <div className="px-1">{addTile}</div>}
        </nav>

        <section aria-label="Lámina seleccionada" className="grid min-w-0 content-start gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <IconButton
                label="Lámina anterior (←)"
                onClick={() => setSel(index - 1)}
                disabled={index === 0}
              >
                <ChevronLeft />
              </IconButton>
              <span className="min-w-[7rem] text-center text-[0.88rem] font-[650] text-ink tabular-nums">
                Lámina {index + 1} de {total}
              </span>
              <IconButton
                label="Lámina siguiente (→)"
                onClick={() => setSel(index + 1)}
                disabled={index >= total - 1}
              >
                <ChevronRight />
              </IconButton>
            </div>
            {spec.multi ? (
              <div className="flex items-center gap-1">
                <IconButton label="Mover antes" onClick={() => move(-1)} disabled={index === 0}>
                  <ArrowUp className="hidden xl:block" />
                  <ArrowLeft className="xl:hidden" />
                </IconButton>
                <IconButton
                  label="Mover después"
                  onClick={() => move(1)}
                  disabled={index >= total - 1}
                >
                  <ArrowDown className="hidden xl:block" />
                  <ArrowRight className="xl:hidden" />
                </IconButton>
                <IconButton label="Duplicar lámina" onClick={duplicate} disabled={!canAdd}>
                  <CopyPlus />
                </IconButton>
                <IconButton label="Añadir lámina después" onClick={addAfter} disabled={!canAdd}>
                  <Plus />
                </IconButton>
                <IconButton
                  label="Borrar lámina"
                  onClick={removeSlide}
                  disabled={total <= 1}
                  danger
                >
                  <Trash2 />
                </IconButton>
              </div>
            ) : (
              <p className="text-[0.82rem] text-ink-3">{spec.label}: una sola lámina</p>
            )}
          </div>

          <div
            className="grid place-items-center overflow-hidden rounded-[18px] border border-rule bg-sheet-2 p-3 sm:p-6 lg:min-h-[calc(100dvh-290px)]"
            style={{
              backgroundImage:
                'radial-gradient(color-mix(in srgb, var(--ink) 11%, transparent) 1px, transparent 1.4px)',
              backgroundSize: '18px 18px',
            }}
          >
            <div
              className="w-full"
              style={{ maxWidth: `calc((100dvh - 336px) * ${ratio.toFixed(4)})` }}
            >
              <MaquetaSlideView
                format={doc.format}
                style={doc.style}
                slide={slide}
                index={index}
                total={total}
                className="shadow-[0_28px_60px_-28px_rgb(32_21_21/0.55)]"
              />
            </div>
          </div>

          <ol
            ref={stripRef}
            aria-label="Láminas"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1.5 sm:-mx-9 sm:px-9 lg:mx-0 lg:px-1 xl:hidden"
          >
            {doc.slides.map((s, i) => (
              <li
                key={i}
                data-thumb={i}
                className={clsx('shrink-0', doc.format === 'portada' ? 'w-[120px]' : 'w-[72px]')}
              >
                {thumbButton(s, i)}
              </li>
            ))}
            {spec.multi && <li className="w-[72px] shrink-0">{addTile}</li>}
          </ol>
        </section>

        {/* ------------------------------------------------ inspector */}
        <aside
          aria-label="Propiedades"
          className="grid content-start gap-3 lg:sticky lg:top-[72px] lg:max-h-[calc(100dvh-92px)] lg:self-start lg:overflow-y-auto lg:pr-1 lg:pb-2"
        >
          <Section
            title="Lámina"
            meta={`${index + 1} de ${total} · ${LAYOUT_COPY[slide.layout].label}`}
            open={isOpen('lamina')}
            onToggle={() => toggle('lamina')}
          >
            <div>
              <GroupLabel>Diseño</GroupLabel>
              <div
                role="radiogroup"
                aria-label="Diseño de la lámina"
                className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-3"
              >
                {LAYOUTS_ORDER.map((l) => {
                  const on = slide.layout === l;
                  return (
                    <button
                      key={l}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => patchSlide({ layout: l })}
                      title={LAYOUT_COPY[l].hint}
                      className={clsx(
                        'grid min-w-0 content-start gap-1 rounded-[10px] p-1 text-left transition',
                        on ? 'bg-sheet-2 ring-2 ring-marker' : 'hover:bg-sheet-2',
                      )}
                    >
                      <MaquetaSlideView
                        format={doc.format}
                        style={deferredStyle}
                        slide={{ ...deferredSlide, layout: l }}
                        index={index}
                        total={total}
                      />
                      <span
                        className={clsx(
                          'truncate px-0.5 text-[0.76rem]',
                          on ? 'font-[700] text-ink' : 'text-ink-2',
                        )}
                      >
                        {LAYOUT_COPY[l].label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[0.78rem] text-ink-3">{LAYOUT_COPY[slide.layout].hint}.</p>
            </div>
            {labels.kicker && (
              <TextField
                label={labels.kicker}
                value={slide.kicker}
                max={LIMITS.kicker}
                placeholder={slide.layout === 'cifra' ? '73 %' : 'Shadow AI'}
                note={kickerNote(slide.layout, slide.kicker)}
                onChange={(kicker) => patchSlide({ kicker: kicker.replace(/\n+/g, ' ') })}
              />
            )}
            <TextField
              multiline
              rows={2}
              label={labels.title}
              value={slide.title}
              max={LIMITS.title}
              note={titleNote(slide.layout, slide.title, brand.handle)}
              onChange={(title) => patchSlide({ title: title.replace(/\n+/g, ' ') })}
            />
            <TextField
              multiline
              rows={slide.layout === 'lista' ? 5 : 3}
              label={labels.body}
              value={slide.body}
              max={LIMITS.body}
              note={bodyNote(slide.layout, slide.body)}
              onChange={(body) => patchSlide({ body })}
            />
          </Section>

          <Section
            title="Estilo"
            meta={preset ? preset.name : `Personalizado${base ? `, desde ${base.name}` : ''}`}
            open={isOpen('estilo')}
            onToggle={() => toggle('estilo')}
          >
            <div>
              <GroupLabel>Estilos base</GroupLabel>
              <div
                role="radiogroup"
                aria-label="Estilo base"
                className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-3"
              >
                {PRESETS.map((p) => {
                  const look = styleFrom(p.id, deferredStyle.brand);
                  const on = preset?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => applyPreset(p.id)}
                      className={clsx(
                        'grid min-w-0 content-start gap-1 rounded-[10px] p-1 text-left transition',
                        on ? 'bg-sheet-2 ring-2 ring-marker' : 'hover:bg-sheet-2',
                      )}
                    >
                      <MaquetaSlideView
                        format={doc.format}
                        style={look}
                        slide={deferredSlide}
                        index={index}
                        total={total}
                      />
                      <span
                        className={clsx(
                          'truncate px-0.5 text-[0.74rem]',
                          on ? 'font-[700] text-ink' : 'text-ink-2',
                        )}
                      >
                        {p.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <GroupLabel>Colores</GroupLabel>
              <div className="grid grid-cols-2 gap-2">
                <ColorField
                  label="Fondo"
                  value={doc.style.bg}
                  onChange={(bg) => patchStyle({ bg })}
                />
                <ColorField
                  label="Texto"
                  value={doc.style.ink}
                  onChange={(ink) => patchStyle({ ink })}
                />
                <ColorField
                  label="Acento"
                  value={doc.style.accent}
                  onChange={(accent) => patchStyle({ accent })}
                />
                <ColorField
                  label="Suave"
                  value={doc.style.soft}
                  onChange={(soft) => patchStyle({ soft })}
                />
              </div>
              {contrast(doc.style.bg, doc.style.ink) < 3 && (
                <p className="mt-2 flex items-start gap-1.5 text-[0.78rem] text-pending">
                  <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                  Poco contraste entre el fondo y el texto: en el teléfono puede no leerse.
                </p>
              )}
            </div>
            <Segmented
              label="Letra"
              value={doc.style.font}
              onChange={(font) => patchStyle({ font })}
              options={[
                {
                  value: 'hanken',
                  label: 'Hanken',
                  style: { fontFamily: 'var(--font-hanken), system-ui, sans-serif' },
                },
                {
                  value: 'mono',
                  label: 'Mono',
                  style: { fontFamily: 'var(--font-jetbrains), ui-monospace, monospace' },
                },
              ]}
            />
            <Segmented
              label="Titular"
              value={doc.style.headline}
              onChange={(headline) => patchStyle({ headline })}
              options={[
                { value: 'grueso', label: <span className="font-[800]">Grueso</span> },
                { value: 'fino', label: <span className="font-[300]">Fino</span> },
              ]}
            />
            <Segmented
              label="Alineación"
              value={doc.style.align}
              onChange={(align) => patchStyle({ align })}
              options={[
                {
                  value: 'izquierda',
                  label: (
                    <>
                      <AlignLeft className="size-4" aria-hidden />
                      Izquierda
                    </>
                  ),
                },
                {
                  value: 'centro',
                  label: (
                    <>
                      <AlignCenter className="size-4" aria-hidden />
                      Centro
                    </>
                  ),
                },
              ]}
            />
            <Segmented
              label="Textura"
              value={doc.style.texture}
              onChange={(texture) => patchStyle({ texture })}
              className="grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4"
              options={[
                { value: 'ninguna', label: 'Ninguna' },
                { value: 'ondas', label: 'Ondas' },
                { value: 'cuadricula', label: 'Cuadrícula' },
                { value: 'avion', label: 'Avión' },
              ]}
            />
          </Section>

          <Section
            title="Marca"
            meta={[brand.name, brand.handle].filter(Boolean).join(' · ')}
            open={isOpen('marca')}
            onToggle={() => toggle('marca')}
          >
            <TextField
              label="Nombre"
              value={brand.name}
              max={LIMITS.brand}
              onChange={(name) => patchBrand({ name })}
            />
            <TextField
              label="Usuario"
              value={brand.handle}
              max={LIMITS.brand}
              placeholder="@tuequipo"
              note={
                brand.handle
                  ? `El cierre invita: «Síguenos en ${brand.handle}».`
                  : 'Sin usuario, el cierre no muestra la invitación a seguir.'
              }
              onChange={(handle) => patchBrand({ handle })}
            />
            <Switch
              label="Logo"
              description="Un círculo con las iniciales del nombre."
              checked={brand.logo}
              onChange={(logo) => patchBrand({ logo })}
            />
            {(brand.name !== profileBrand.name || brand.handle !== profileBrand.handle) && (
              <button
                type="button"
                onClick={() => patchBrand({ name: profileBrand.name, handle: profileBrand.handle })}
                className="justify-self-start text-left text-[0.84rem] font-[650] text-brand hover:underline"
              >
                Usar la marca de Mi empresa: {profileBrand.name}
                {profileBrand.handle ? ` · ${profileBrand.handle}` : ''}
              </button>
            )}
          </Section>

          <Section
            title="Formato"
            meta={spec.label}
            open={isOpen('formato')}
            onToggle={() => toggle('formato')}
          >
            <div role="radiogroup" aria-label="Formato" className="grid gap-2">
              {FORMATS_ORDER.map((f) => {
                const fs = FORMAT_SPEC[f];
                const on = f === doc.format;
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => switchFormat(f)}
                    className={clsx(
                      'flex items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition',
                      on
                        ? 'border-ink bg-ink text-sheet'
                        : 'border-rule bg-sheet text-ink hover:border-rule-strong',
                    )}
                  >
                    <FormatGlyph
                      format={f}
                      size={24}
                      className={on ? 'text-marker' : 'text-ink-2'}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.88rem] font-[700]">{fs.label}</span>
                      <span
                        className={clsx(
                          'block text-[0.76rem]',
                          on ? 'text-sheet/70' : 'text-ink-2',
                        )}
                      >
                        {fs.hint} · {fs.multi ? 'varias láminas' : 'una lámina'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {stash ? (
              <p
                role="status"
                className="rounded-[10px] bg-pending-tint px-3 py-2 text-[0.8rem] leading-snug text-ink"
              >
                {spec.label} lleva una sola lámina: dejamos la primera y apartamos{' '}
                {stash.length === 1 ? 'la otra' : `las otras ${stash.length}`}. Vuelven si eliges un
                formato de varias láminas antes de salir.
              </p>
            ) : (
              <p className="text-[0.78rem] text-ink-3">
                Al cambiar de formato el texto se queda; los de una lámina conservan la primera.
              </p>
            )}
          </Section>
        </aside>
      </div>

      {/* ------------------------------------------------ phone actions */}
      <div className="material fixed inset-x-0 bottom-0 z-30 border-t border-rule px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="mx-auto grid max-w-[560px] grid-cols-2 gap-2">
          {scheduleButton('w-full')}
          {saveButton('w-full')}
        </div>
      </div>

      {exporting && (
        <MaquetaExportStage
          maqueta={doc}
          stageRef={(el) => {
            stageRef.current = el;
          }}
        />
      )}

      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={(open) => {
          setScheduleOpen(open);
          if (!open && copyToOpen) router.replace(`/maquetas/${copyToOpen}`);
        }}
        source={{ maquetaId: saved.id }}
        what={what}
      />
      <ReuseDialog
        open={reuseOpen}
        onOpenChange={setReuseOpen}
        maqueta={{ id: saved.id, name: doc.name, origin: doc.origin }}
        onPick={reuseFor}
      />
      <Dialog
        open={leaveTo !== null}
        onOpenChange={(open) => !open && setLeaveTo(null)}
        title="Tienes cambios sin guardar"
        description="Si sales ahora, se pierden los cambios de esta maqueta."
      >
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => setLeaveTo(null)}>Seguir editando</Button>
          <Button
            variant="danger"
            onClick={() => {
              const to = leaveTo;
              setLeaveTo(null);
              if (to) router.push(to);
            }}
          >
            Salir sin guardar
          </Button>
          <Button
            variant="primary"
            loading={saving}
            onClick={async () => {
              const to = leaveTo;
              if (!(await save(true)) || !to) return;
              setLeaveTo(null);
              router.push(to);
            }}
          >
            {demo ? 'Guardar copia y salir' : 'Guardar y salir'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
