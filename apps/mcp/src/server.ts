/**
 * MCP tools so any assistant (Claude, ChatGPT, an internal agent) can ask the radar: the week's
 * growing topics, one topic in depth, how 30X would tell it, free questions, and sending a public
 * post as the community sensor. Read-only apart from the sensor; nothing is ever published.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { RadarError, type RadarClient, type RadarTopic } from './client';

const STAGE: Record<string, string> = {
  emergente: 'emergente',
  crecimiento: 'en crecimiento',
  saturado: 'saturado',
  declive: 'en declive',
  estable: 'estable',
};

function text(value: string) {
  return { content: [{ type: 'text' as const, text: value }] };
}

function failure(error: unknown) {
  const message =
    error instanceof RadarError || error instanceof Error ? error.message : String(error);
  return { ...text(`El radar no pudo responder: ${message}`), isError: true };
}

const growth = (t: RadarTopic) =>
  t.fresh
    ? 'nuevo esta semana'
    : `${t.growthPct >= 0 ? '+' : ''}${t.growthPct} % frente a su promedio`;

function line(t: RadarTopic): string {
  return `${t.rank}. ${t.name} (id ${t.id}): ${STAGE[t.stage] ?? t.stage}, ${growth(t)}, ${t.creators} creadores, en ${t.platforms.join(', ') || 'sin redes'}. Momento: ${t.timing}.${t.fit ? ` Encaje con 30X: ${t.fit}/10.` : ''}${t.why ? ` Por qué: ${t.why}` : ''}`;
}

export function createRadarServer(client: RadarClient): McpServer {
  const server = new McpServer({ name: 'radar-30x', version: '1.0.0' });

  server.registerTool(
    'radar_semana',
    {
      title: 'Los temas de IA que más crecen esta semana',
      description:
        'Los 10 temas de IA que más crecen esta semana en redes, por defecto solo los que le sirven a la audiencia de 30X, con su etapa (emergente, en crecimiento, saturado, en declive), el momento recomendado para publicar y el encaje con 30X.',
      inputSchema: {
        red: z
          .enum(['all', 'linkedin', 'instagram', 'youtube', 'tiktok', 'x'])
          .optional()
          .describe('Red donde debe moverse el tema'),
        solo_espanol: z.boolean().optional().describe('Solo piezas en español'),
        sin_explotar_por_30x: z.boolean().optional().describe('Solo temas que 30X no ha tocado'),
        incluir_todos: z
          .boolean()
          .optional()
          .describe('Incluir también los temas que no le sirven a la audiencia de 30X'),
      },
    },
    async ({ red, solo_espanol, sin_explotar_por_30x, incluir_todos }) => {
      try {
        const week = await client.radar({
          platform: red,
          region: solo_espanol ? 'latam' : 'global',
          untouched: sin_explotar_por_30x,
          everything: incluir_todos,
        });
        return text(
          [
            week.headline,
            '',
            ...week.topics.map(line),
            ...(week.forming.length
              ? [
                  '',
                  'Se están formando (aún no llegan a LinkedIn ni a Instagram):',
                  ...week.forming.map((t) => `- ${t.name} (id ${t.id})`),
                ]
              : []),
          ].join('\n'),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'tema',
    {
      title: 'Un tema en detalle',
      description:
        'Por qué crece un tema, qué tienen en común las piezas que despegaron, su encaje con 30X y la evidencia.',
      inputSchema: { id: z.string().describe('id del tema, como lo devuelve radar_semana') },
    },
    async ({ id }) => {
      try {
        const d = await client.topic(id);
        return text(
          [
            line(d.topic),
            d.topic.definition ?? '',
            d.why.narrative
              ? `\nPor qué funcionan las piezas que despegan: ${d.why.narrative}`
              : '',
            ...d.why.patterns.map((p) => `- ${p.label}`),
            d.fit
              ? `\nEncaje con 30X: ${d.fit.score}/10, programa ${d.fit.pillar}. ${d.fit.reasons.join(' ')}`
              : '',
            '\nEvidencia:',
            ...d.evidence
              .slice(0, 5)
              .map(
                (p) =>
                  `- ${p.platform}, ${p.authorName}${p.outlier ? ` (${p.outlier}× su mediana)` : ''}: «${(p.hook || p.title || p.text).slice(0, 140)}» ${p.url}`,
              ),
          ]
            .filter(Boolean)
            .join('\n'),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'como_contarlo',
    {
      title: 'Cómo lo cuenta 30X',
      description:
        'Un post de LinkedIn, un guion de Reel y un video de YouTube sobre el tema, con la voz de 30X. Son borradores para que una persona revise y apruebe.',
      inputSchema: {
        id: z.string().describe('id del tema'),
        version: z
          .number()
          .int()
          .min(0)
          .max(5)
          .optional()
          .describe('0 = la primera versión; 1 o más, otra'),
      },
    },
    async ({ id, version }) => {
      try {
        const a = await client.adapt(id, version ?? 0);
        return text(
          [
            `Ángulo: ${a.angle}`,
            `Ganchos: ${a.hooks.join(' / ')}`,
            '',
            'Post de LinkedIn:',
            a.linkedin,
            '',
            `Reel (0–3 s): ${a.reel.hook}`,
            ...a.reel.beats.map((b, i) => `${i + 1}. ${b}`),
            `Cierre: ${a.reel.cta}`,
            '',
            `YouTube: ${a.youtube.title} (miniatura: ${a.youtube.thumbnail})`,
          ].join('\n'),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'preguntar_al_radar',
    {
      title: 'Pregúntale al radar',
      description:
        'Pregunta libre sobre los temas de IA de la semana; responde con los datos del radar y cita los temas.',
      inputSchema: { pregunta: z.string().min(3).describe('La pregunta, en español') },
    },
    async ({ pregunta }) => {
      try {
        const r = await client.ask(pregunta);
        return text([r.answer, '', ...r.refs.map((x) => `- ${x.label} (id ${x.ref})`)].join('\n'));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'mandar_al_radar',
    {
      title: 'Mandar un post público al radar',
      description:
        'Suma un post público (LinkedIn, Instagram, TikTok, YouTube, X o Bluesky) que está funcionando. El radar lee su página pública y lo agrega a su tema.',
      inputSchema: {
        url: z.string().url().describe('Enlace público del post'),
        quien: z.string().optional().describe('Quién lo manda'),
      },
    },
    async ({ url, quien }) => {
      try {
        const r = await client.send(url, quien ?? 'Agente por MCP');
        return text(
          `Entró al radar: ${r.title}.${r.topics.length ? ` Sumó a: ${r.topics.map((t) => t.name).join(', ')}.` : ''}`,
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}
