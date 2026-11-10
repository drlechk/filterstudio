/** Small, exact expression DAG for WDF coefficients. No rounded values enter
 * simplification; only literal constants and identical symbolic terms combine. */
export type Expression = {
  id: number;
  kind: 'constant' | 'symbol' | 'sum' | 'product';
  value: number;
  scale: number;
  latex: string;
  children: Expression[];
  cost: number;
};

export class WdfExpressions {
  private nodes = new Map<string, Expression>();

  private intern(key: string, node: Omit<Expression, 'id'>): Expression {
    const existing = this.nodes.get(key);
    if (existing) return existing;
    const result = { ...node, id: this.nodes.size };
    this.nodes.set(key, result);
    return result;
  }

  constant(value: number): Expression {
    return this.intern(`c:${value}`, { kind: 'constant', value, scale: value, latex: String(value), children: [], cost: 1 });
  }

  symbol(latex: string, value: number): Expression {
    return this.intern(`s:${latex}`, { kind: 'symbol', value, scale: 1, latex, children: [], cost: 1 });
  }

  multiply(...factors: Expression[]): Expression {
    let scale = 1;
    const children: Expression[] = [];
    for (const factor of factors) {
      if (factor.kind === 'constant') scale *= factor.value;
      else if (factor.kind === 'product') { scale *= factor.scale; children.push(...factor.children); }
      else children.push(factor);
    }
    if (scale === 0 || !children.length) return this.constant(scale);
    if (scale === 1 && children.length === 1) return children[0];
    if (children.length === 1 && children[0].kind === 'sum') {
      return this.add(...children[0].children.map(c => this.multiply(this.constant(scale), c)));
    }
    children.sort((a, b) => a.id - b.id);
    return this.intern(`p:${scale}:${children.map(c => c.id)}`, {
      kind: 'product', scale, children, latex: '', value: children.reduce((v, c) => v * c.value, scale),
      cost: Math.min(100000, 1 + children.reduce((v, c) => v + c.cost, 0)),
    });
  }

  add(...terms: Expression[]): Expression {
    let constant = 0;
    const weights = new Map<Expression, number>();
    const visit = (term: Expression, weight: number) => {
      if (term.kind === 'constant') constant += weight * term.value;
      else if (term.kind === 'sum') term.children.forEach(c => visit(c, weight));
      else if (term.kind === 'product' && term.scale !== 1) {
        visit(this.multiply(...term.children), weight * term.scale);
      } else weights.set(term, (weights.get(term) ?? 0) + weight);
    };
    terms.forEach(term => visit(term, 1));
    const children = [...weights].filter(([, weight]) => weight !== 0)
      .map(([term, weight]) => this.multiply(this.constant(weight), term));
    if (constant) children.push(this.constant(constant));
    children.sort((a, b) => a.id - b.id);
    if (!children.length) return this.constant(0);
    if (children.length === 1) return children[0];
    // Factor common products before assigning group names: a*x + b*x becomes
    // (a+b)*x, so complementary port weights can cancel symbolically as well.
    const candidates = new Map<Expression, Expression[]>();
    for (const child of children) {
      const factors = child.kind === 'product' ? child.children : child.kind === 'constant' ? [] : [child];
      for (const factor of new Set(factors)) candidates.set(factor, [...(candidates.get(factor) ?? []), child]);
    }
    for (const [factor, terms] of [...candidates].sort((a, b) => b[1].length - a[1].length)) {
      if (terms.length < 2) continue;
      const remainders = terms.map(term => {
        if (term === factor) return this.constant(1);
        const factors = [...term.children];
        factors.splice(factors.indexOf(factor), 1);
        return this.multiply(this.constant(term.scale), ...factors);
      });
      const combined = this.multiply(factor, this.add(...remainders));
      if (combined.cost >= terms.reduce((sum, term) => sum + term.cost, 0)) continue;
      return this.add(...children.filter(child => !terms.includes(child)), combined);
    }
    return this.intern(`a:${children.map(c => c.id)}`, {
      kind: 'sum', scale: 1, children, latex: '', value: children.reduce((v, c) => v + c.value, 0),
      cost: Math.min(100000, 1 + children.reduce((v, c) => v + c.cost, 0)),
    });
  }
}

export function expressionLatex(node: Expression, names = new Map<number, string>()): string {
  const name = names.get(node.id);
  if (name) return name;
  if (node.kind === 'constant') return node.value === .5 ? '\\tfrac{1}{2}' : node.value === -.5 ? '-\\tfrac{1}{2}' : node.latex;
  if (node.kind === 'symbol') return node.latex;
  if (node.kind === 'sum') return node.children.map(c => expressionLatex(c, names)).join('+').replace(/\+\-/g, '-');
  const scale = node.scale === 1 ? '' : node.scale === -1 ? '-' : `${node.scale === .5 ? '\\tfrac{1}{2}' : node.scale === -.5 ? '-\\tfrac{1}{2}' : node.scale}\\,`;
  return scale + node.children.map(c => {
    const text = expressionLatex(c, names);
    return c.kind === 'sum' && !names.has(c.id) ? `\\left(${text}\\right)` : text;
  }).join('\\,');
}

/** Give only reused or long expressions a name, in dependency order. */
export function expressionGroups(roots: Expression[]) {
  const uses = new Map<number, number>(), visited = new Set<number>(), order: Expression[] = [];
  const visit = (node: Expression) => {
    uses.set(node.id, (uses.get(node.id) ?? 0) + 1);
    if (visited.has(node.id)) return;
    visited.add(node.id);
    node.children.forEach(visit);
    order.push(node);
  };
  roots.forEach(visit);
  const names = new Map<number, string>(), definitions: string[] = [];
  const cost = (node: Expression): number => names.has(node.id) ? 1 : 1 + node.children.reduce((sum, child) => sum + cost(child), 0);
  for (const node of order) {
    const expandedCost = cost(node);
    if (expandedCost < 4 || (expandedCost < 12 && uses.get(node.id)! < 2)) continue;
    const name = `\\kappa_{${names.size + 1}}`;
    definitions.push(`${name}&=${expressionLatex(node, names)}`);
    names.set(node.id, name);
  }
  return { names, definitions };
}
