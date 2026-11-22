/** A horizontal layout problem, as findLayoutProblems reports it (see layout.ts). */
export interface LayoutProblem {
  /**
   * - `page-overflow`: the page scrolls sideways. There's one problem for each
   *   of the outermost elements that reach past its right edge.
   * - `spills-card`: a control (button, field, link...) sticks out of the card
   *   that holds it, or of any other box with a background or a border all
   *   round, or is cut off by one that hides what doesn't fit.
   * - `box-spills-card`: a box that isn't a control — a table, a grid, or
   *   anything with a background or a border all round — has an edge past the
   *   card that holds it. Nothing inside it need be out of place: the box
   *   itself is what doesn't fit.
   * - `squeezed-control`: a control is on the page but has no width left, so
   *   it can't be seen or clicked (say, a flex item that shrank to nothing).
   */
  check: 'page-overflow' | 'spills-card' | 'box-spills-card' | 'squeezed-control';
  /** The element, as `Section › tag "name"`: the heading of its section, then the element. */
  element: string;
  detail: string;
}

/**
 * Helpers that run inside the page. The `page` fixture installs them in every
 * page before the app starts (page.addInitScript), so this function must be
 * self-contained: Playwright sends its source to the browser, without
 * anything it might refer to outside. (Types are erased, so naming one is fine.)
 */
export function installInPageHelpers(): void {
  const TOLERANCE = 1; // px: sub-pixel rounding
  const CONTROLS = [
    'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea', 'summary',
    '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
    '[role="tab"]', '[role="slider"]', '[role="spinbutton"]', '[role="combobox"]', '[role="textbox"]',
    '[contenteditable=""]', '[contenteditable="true"]', '[tabindex]:not([tabindex^="-"])',
  ].join(', ');
  /**
   * The controls that can hold other elements: a box inside one of these is
   * the control's own business (check 2), not its own. A merely focusable
   * container (`[tabindex="0"]`) isn't one of them: the sheet's tab panel is
   * focusable, and everything on the tab is inside it.
   */
  const WRAPPING_CONTROLS = [
    'a[href]', 'button', 'summary', '[role="button"]', '[role="link"]', '[role="tab"]',
    '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
  ].join(', ');

  const clean = (text: string | null | undefined, max = 40) => {
    const t = (text ?? '').replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  };
  const px = (n: number) => `${Math.round(n)}px`;
  /** A computed colour with no alpha: `rgba(0, 0, 0, 0)`, or `oklab(… / 0)` and the like from Tailwind's opacity modifiers. */
  const transparent = (color: string) => color === 'transparent' || /^rgba\(.*,\s*0\)$|\/\s*0\)$/.test(color);
  const scrollsSideways = (s: CSSStyleDeclaration) => s.overflowX === 'auto' || s.overflowX === 'scroll';
  const clipsSideways = (s: CSSStyleDeclaration) => s.overflowX === 'hidden' || s.overflowX === 'clip';
  /** A card, or anything else that looks like a box: a background, or a border all round. */
  const isBox = (s: CSSStyleDeclaration) =>
    !transparent(s.backgroundColor) ||
    ['top', 'right', 'bottom', 'left'].every(
      (side) =>
        parseFloat(s.getPropertyValue(`border-${side}-width`)) > 0 &&
        s.getPropertyValue(`border-${side}-style`) !== 'none' &&
        !transparent(s.getPropertyValue(`border-${side}-color`)),
    );
  /** Laid out as a box of its own, whether or not it draws one: a table or a grid. */
  const isTableOrGrid = (s: CSSStyleDeclaration) => /^(inline-)?(table|grid)$/.test(s.display);
  /** Computed styles for one walk of the page, read from each element once. */
  type StyleOf = (el: Element) => CSSStyleDeclaration;
  const styleReader = (): StyleOf => {
    const cache = new Map<Element, CSSStyleDeclaration>();
    return (el) => {
      let style = cache.get(el);
      if (!style) {
        style = getComputedStyle(el);
        cache.set(el, style);
      }
      return style;
    };
  };
  const shown = (el: Element, styleOf: StyleOf) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && styleOf(el).visibility !== 'hidden';
  };
  /** Something on the way up is fully transparent, so nothing inside it shows. */
  const fadedOut = (el: Element, styleOf: StyleOf) => {
    for (let a: Element | null = el; a && a !== document.body; a = a.parentElement) {
      if (parseFloat(styleOf(a).opacity) === 0) return true;
    }
    return false;
  };
  /** Inside something that scrolls sideways by design, or in the map's drawing: not page layout. */
  const exempt = (el: Element, styleOf: StyleOf) => {
    if (el.closest('svg')) return true;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (scrollsSideways(styleOf(a))) return true;
    }
    return false;
  };

  /** The heading of the section `el` is in: the nearest heading before it. */
  const sectionOf = (el: Element) => {
    if (el.closest('header')) return 'Header';
    if (el.closest('footer')) return 'Footer';
    for (let a: Element | null = el; a && a !== document.body; a = a.parentElement) {
      for (let s = a.previousElementSibling; s; s = s.previousElementSibling) {
        const headings = s.matches('h2, h3, h4') ? [s] : [...s.querySelectorAll('h2, h3, h4')];
        const heading = headings.filter((h) => !h.closest('.sr-only')).pop();
        if (heading) return clean(heading.textContent, 30);
      }
    }
    return '';
  };
  /** The text shown as a field's label when it isn't tied to the field (a <label> without `for`, before it). */
  const looseLabelOf = (el: Element) => {
    for (let a: Element | null = el, depth = 0; a && depth < 3; a = a.parentElement, depth++) {
      for (let s = a.previousElementSibling; s; s = s.previousElementSibling) {
        const label = s instanceof HTMLLabelElement ? s : s.querySelector('label');
        if (label && !label.control) return clean(label.textContent, 30);
      }
    }
    return '';
  };
  /** The class (or inline style) that gives `el` its text colour, and any opacity that fades it. */
  const colorOf = (el: Element) => {
    let source = '';
    let opacity = 1;
    for (let a: Element | null = el; a; a = a.parentElement) {
      if (!source) {
        const token = [...a.classList].find((c) => /^text-\[#[0-9a-f]{3,8}\](\/\d+)?$/i.test(c));
        if (token) source = token;
        else if (a instanceof HTMLElement && a.style.color) source = `style color ${a.style.color}`;
      }
      opacity *= parseFloat(getComputedStyle(a).opacity);
    }
    return [source, opacity < 1 ? `opacity ${Math.round(opacity * 100) / 100}` : ''].filter(Boolean).join(', ');
  };

  /**
   * An element, described for people and for the known-issues list:
   * `Section › tag[type] "name" (label "…") (colour)`.
   */
  const describe = (el: Element, { withColor = false } = {}) => {
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute('type');
    const name =
      el.getAttribute('aria-label') ??
      el.getAttribute('title') ??
      el.getAttribute('placeholder') ??
      (el instanceof HTMLSelectElement
        ? el.selectedOptions[0]?.textContent
        : el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
          ? el.value
          : el.textContent);
    const section = sectionOf(el);
    const looseLabel = el.matches('input, select, textarea') ? looseLabelOf(el) : '';
    const color = withColor ? colorOf(el) : '';
    return [
      `${section ? `${section} › ` : ''}${tag}${type ? `[type=${type}]` : ''}`,
      name ? `"${clean(name)}"` : '',
      looseLabel ? `(label "${looseLabel}")` : '',
      color ? `(${color})` : '',
    ].filter(Boolean).join(' ');
  };

  /** See findLayoutProblems in layout.ts. */
  const findLayoutProblems = () => {
    const problems: LayoutProblem[] = [];
    const styleOf = styleReader();
    const root = document.documentElement;
    const pageWidth = root.clientWidth;

    // 1. The page scrolls sideways. Name the outermost elements that reach
    // past the right edge, so the report points at the cause.
    if (root.scrollWidth > pageWidth + TOLERANCE) {
      const offenders: Element[] = [];
      for (const el of document.body.querySelectorAll('*')) {
        if (!shown(el, styleOf) || exempt(el, styleOf)) continue;
        if (el.getBoundingClientRect().right <= pageWidth + TOLERANCE) continue;
        if (offenders.some((o) => o.contains(el))) continue;
        offenders.push(el);
      }
      const detail = `the page is ${px(root.scrollWidth)} wide in a ${px(pageWidth)} window`;
      if (offenders.length === 0) problems.push({ check: 'page-overflow', element: 'page', detail });
      for (const el of offenders) {
        problems.push({ check: 'page-overflow', element: describe(el), detail: `${detail}; it reaches ${px(el.getBoundingClientRect().right)}` });
      }
    }

    // 2. Controls that stick out of their card, or are cut off by one that
    // hides what doesn't fit.
    for (const el of document.body.querySelectorAll(CONTROLS)) {
      if (!shown(el, styleOf) || exempt(el, styleOf)) continue;
      const r = el.getBoundingClientRect();
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const s = styleOf(a);
        if (!clipsSideways(s) && !isBox(s)) continue;
        const box = a.getBoundingClientRect();
        const left = box.left - r.left;
        const right = r.right - box.right;
        if (left > TOLERANCE || right > TOLERANCE) {
          const sides = [left > TOLERANCE ? `${px(left)} on the left` : '', right > TOLERANCE ? `${px(right)} on the right` : ''];
          problems.push({
            check: 'spills-card',
            element: describe(el),
            detail: `${clipsSideways(s) ? 'is cut off by' : 'sticks out of'} its card by ${sides.filter(Boolean).join(' and ')}`,
          });
        }
        break;
      }
    }

    // 3. Controls laid out with no width left, such as a flex item that
    // shrank to nothing: they're on the page, but can't be seen or clicked.
    for (const el of document.body.querySelectorAll(CONTROLS)) {
      if (el.getClientRects().length === 0 || styleOf(el).visibility === 'hidden' || exempt(el, styleOf)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 && r.height > 0) {
        problems.push({ check: 'squeezed-control', element: describe(el), detail: `is squeezed to ${px(r.width)} wide` });
      }
    }

    // 4. Boxes that stick out of the card that holds them. A table, a grid or a
    // div with its own background can be wider than its card without any
    // control inside it reaching past the card's edge on its own — nothing in
    // check 2 sees it when the box's own edge is the only thing out of place.
    // Only the outermost such box is reported, as in check 1, so a wrapper and
    // what it holds give one problem rather than one each.
    const spilled: Element[] = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (!shown(el, styleOf) || exempt(el, styleOf) || el.matches(CONTROLS) || el.closest(WRAPPING_CONTROLS)) continue;
      const s = styleOf(el);
      // A box: a background or a border all round, or a table or grid, which is
      // a box without drawing one. Its content scrolling sideways is its own
      // business, not this check's.
      if (!(isBox(s) || isTableOrGrid(s)) || scrollsSideways(s)) continue;
      // Placed where it is on purpose (an overlay, a badge) rather than laid
      // out, or faded out until something else happens: not a layout problem.
      if (s.position === 'absolute' || s.position === 'fixed' || fadedOut(el, styleOf)) continue;
      // The card that holds it: the nearest ancestor that is a box or hides
      // what doesn't fit. A box with only page-level wrappers around it isn't
      // in a card, so it isn't this check's problem either.
      let card: Element | null = el.parentElement;
      for (; card && card !== document.body; card = card.parentElement) {
        const cardStyle = styleOf(card);
        if (isBox(cardStyle) || clipsSideways(cardStyle)) break;
      }
      if (!card || card === document.body) continue;
      const box = card.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const left = box.left - r.left;
      const right = r.right - box.right;
      if (left <= TOLERANCE && right <= TOLERANCE) continue;
      if (spilled.some((outer) => outer.contains(el))) continue;
      spilled.push(el);
      const sides = [left > TOLERANCE ? `${px(left)} on the left` : '', right > TOLERANCE ? `${px(right)} on the right` : ''];
      problems.push({
        check: 'box-spills-card',
        element: describe(el),
        detail: `is ${px(r.width)} wide, ${sides.filter(Boolean).join(' and ')} of the card that holds it`,
      });
    }
    return problems;
  };

  /** Describe the elements axe reported, by their CSS selectors; with their text colour for contrast problems. */
  const describeTargets = (targets: { selector: string; withColor: boolean }[]) =>
    targets.map(({ selector, withColor }) => {
      const el = document.querySelector(selector);
      return el ? describe(el, { withColor }) : selector;
    });

  // ── Placeholder contrast, which axe doesn't check ──────────────────
  let ink: CanvasRenderingContext2D | null = null;
  /** Any CSS colour (rgb, oklab, color-mix...) as sRGB bytes and alpha, read back from a canvas. */
  const rgba = (color: string) => {
    if (!ink) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      ink = canvas.getContext('2d', { willReadFrequently: true })!;
    }
    ink.clearRect(0, 0, 1, 1);
    // A colour the canvas can't read leaves fillStyle as it was.
    ink.fillStyle = '#010203';
    ink.fillStyle = color;
    if (ink.fillStyle === '#010203' && !/^#010203$/i.test(color)) throw new Error(`Can't read the colour "${color}"`);
    ink.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ink.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  };
  type Rgba = ReturnType<typeof rgba>;
  const over = (top: Rgba, below: Rgba): Rgba => ({
    r: top.r * top.a + below.r * (1 - top.a),
    g: top.g * top.a + below.g * (1 - top.a),
    b: top.b * top.a + below.b * (1 - top.a),
    a: 1,
  });
  const luminance = ({ r, g, b }: Rgba) => {
    const channel = (v: number) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const hex = ({ r, g, b }: Rgba) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  /** The colour behind `el`: its backgrounds and its ancestors', on white. */
  const backgroundOf = (el: Element) => {
    const layers: Rgba[] = [];
    for (let a: Element | null = el; a; a = a.parentElement) layers.push(rgba(getComputedStyle(a).backgroundColor));
    return layers.reverse().reduce((below, top) => over(top, below), { r: 255, g: 255, b: 255, a: 1 });
  };

  /** Shown placeholders whose text is below WCAG AA contrast (4.5:1, or 3:1 for large text). */
  const findPlaceholderProblems = () => {
    const problems: { check: 'placeholder-contrast'; element: string; detail: string }[] = [];
    const styleOf = styleReader();
    for (const el of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[placeholder], textarea[placeholder]')) {
      if (!shown(el, styleOf) || !el.placeholder.trim() || el.value !== '' || el.closest('svg')) continue;
      const style = styleOf(el);
      const background = backgroundOf(el);
      const text = over(rgba(getComputedStyle(el, '::placeholder').color), background);
      const [light, dark] = [luminance(text), luminance(background)].sort((a, b) => b - a);
      const ratio = (light + 0.05) / (dark + 0.05);
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && parseInt(style.fontWeight, 10) >= 700);
      const needed = large ? 3 : 4.5;
      if (ratio < needed) {
        problems.push({
          check: 'placeholder-contrast',
          element: describe(el),
          detail: `Placeholder text contrast is ${Math.floor(ratio * 100) / 100}:1 (${hex(text)} on ${hex(background)}, ${Math.round(size)}px); needs ${needed}:1`,
        });
      }
    }
    return problems;
  };

  Object.assign(window, { __e2e: { findLayoutProblems, describeTargets, findPlaceholderProblems } });
}

/** What installInPageHelpers adds to the page. */
export interface InPageHelpers {
  findLayoutProblems(): LayoutProblem[];
  describeTargets(targets: { selector: string; withColor: boolean }[]): string[];
  findPlaceholderProblems(): { check: 'placeholder-contrast'; element: string; detail: string }[];
}
