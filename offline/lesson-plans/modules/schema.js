// modules/schema.js — the LessonPlan shape, in editor order. Pure.

export const STATUS = { DRAFT: 'draft', PUBLISHED: 'published' };

export const OBJECTIVE_STEM = 'Students will be able to ';

export function uid() {
  // ponytail: crypto.randomUUID is in every browser we target and in node 19+.
  return crypto.randomUUID();
}

export function blankPlan(author) {
  const now = new Date().toISOString();
  return {
    id: uid(),
    title: '',
    heroImage: '',
    overview: '',
    pacing: { gradeBand: '', curriculumUnit: '', seasonDateRange: '', links: [] },
    purpose: [],
    objectives: [],
    materials: {
      scaledForClasses: 1,
      scaledForStudents: 30,
      assetLinks: [],
      purchasing: [],
    },
    classLeadPrep: [],
    schedule: { startAnchor: '', statedTotalMinutes: null, phases: [] },
    assessment: [],
    skillsLearned: [],
    photos: [],
    metadata: {
      author: author || '',
      editors: [],
      createdAt: now,
      updatedAt: now,
      status: STATUS.DRAFT,
      version: 0,
    },
  };
}

/** Fill in anything a stored record is missing. Cheap forward-compat. */
export function normalize(raw) {
  const p = { ...blankPlan(''), ...(raw || {}) };
  p.pacing = { ...blankPlan('').pacing, ...(raw?.pacing || {}) };
  p.pacing.links = arr(p.pacing.links);
  p.materials = { ...blankPlan('').materials, ...(raw?.materials || {}) };
  p.materials.assetLinks = arr(p.materials.assetLinks);
  p.materials.purchasing = arr(p.materials.purchasing).map(r => ({
    item: r.item || '', quantity: r.quantity ?? '', unit: r.unit || '', url: r.url || '',
  }));
  p.schedule = { ...blankPlan('').schedule, ...(raw?.schedule || {}) };
  p.schedule.phases = arr(p.schedule.phases).map(ph => ({
    name: ph.name || '',
    blocks: arr(ph.blocks).map(b => ({
      title: b.title || '',
      duration: Number(b.duration) || 0,
      description: b.description || '',
      detailedSteps: arr(b.detailedSteps),
      facilitationNote: b.facilitationNote || '',
    })),
  }));
  p.classLeadPrep = normalizeChecklist(p.classLeadPrep);
  for (const k of ['purpose', 'objectives', 'assessment', 'skillsLearned']) p[k] = arr(p[k]);
  p.photos = arr(p.photos).map(x => (typeof x === 'string' ? { url: x, caption: '' } : x));
  p.metadata = { ...blankPlan('').metadata, ...(raw?.metadata || {}) };
  p.metadata.editors = arr(p.metadata.editors);
  return p;
}

function arr(v) { return Array.isArray(v) ? v : []; }

export function normalizeChecklist(nodes) {
  return arr(nodes).map(n => ({
    text: n.text || '',
    checked: !!n.checked,
    children: normalizeChecklist(n.children),
  }));
}

export function countChecklist(nodes) {
  return arr(nodes).reduce((n, x) => n + 1 + countChecklist(x.children), 0);
}

export function blankBlock() {
  return { title: '', duration: 10, description: '', detailedSteps: [], facilitationNote: '' };
}

/**
 * Rescale purchasing quantities by a ratio. Rounds up — you can't buy 4.5 rolls
 * of tape, and running short in a classroom is worse than a spare.
 * Non-numeric quantities (e.g. "as needed") pass through untouched.
 */
export function rescalePurchasing(purchasing, ratio) {
  if (!isFinite(ratio) || ratio <= 0 || ratio === 1) return purchasing;
  return purchasing.map(row => {
    const q = Number(row.quantity);
    if (!isFinite(q) || q === 0 || row.quantity === '') return row;
    return { ...row, quantity: Math.ceil(q * ratio) };
  });
}
