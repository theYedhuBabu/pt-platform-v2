/* ============ Shared UI primitives + app chrome ============ */
import { useEffect, } from 'react';
import * as React from 'react';
import { Icons as Ic } from './Icons';

import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react';

type Route = {
  view: string;
  [key: string]: unknown;
};

type IconName = string;

interface Crumb {
  label: string;
  go?: () => void;
}

interface TabItem {
  id: string;
  label: React.ReactNode;
  icon?: IconName;
  count?: number;
}

interface ToastItem {
  id: string | number;
  title: React.ReactNode;
  msg?: React.ReactNode;
  icon?: IconName;
  color?: string;
}

interface SegOption {
  value: string;
  label: React.ReactNode;
  icon?: IconName;
}

/* ---- tiny helpers ---- */
export function cx(..._args: (string | undefined | false | null)[]) { return [].slice.call(arguments).filter(Boolean).join(' '); }
export function fmt(n: any) { return (n == null || isNaN(n)) ? '—' : n.toLocaleString('en-US'); }
export function dur(sec: any) {
  if (sec < 60) return sec + 's';
  if (sec < 3600) return Math.round(sec / 60) + 'm';
  return (sec / 3600).toFixed(sec % 3600 ? 1 : 0) + 'h';
}

/* ---- Status badge ---- */
export function Status({ s, label }: {s: string, label?: string}) {
  const map: Record<string, string> = { passed: 'PASSED', failed: 'FAILED', running: 'RUNNING', queued: 'QUEUED', connected: 'CONNECTED', idle: 'IDLE', offline: 'OFFLINE', live: 'LIVE' };
  const cls = s === 'running' ? 'running' : s;
  return <span className={cx('badge', cls)}>{(s === 'running' || s === 'live') && <span className="dot"/>}{label || map[s] || s}</span>;
}

/* ---- Sidebar ---- */
export function Sidebar({ route, go, counts }:{route: Route, go: (route: Route) => void, counts: Record<string, number>}) {
  const item = (view: string, icon: IconName, label: string, count?: any, match?: (r: Route) => boolean) => {
    const Icon = Ic[icon];
    const active = match ? match(route) : route.view === view;
    return (
      <div className={cx('nav-item', active && 'active')} onClick={() => go({ view })}>
        <Icon /><span>{label}</span>{count != null && <span className="count">{count}</span>}
      </div>
    );
  };
  return (
    <aside className="sidebar">
      <div className="brand" onClick={() => go({ view: 'projects' })} style={{ cursor: 'pointer' }}>
        <div className="brand-mark"><Ic.bolt fill="currentColor" stroke="none"/></div>
        <div>
          <div className="brand-name">JMeter Executor</div>
          <div className="brand-sub">hub · :8080</div>
        </div>
      </div>
      <nav className="nav">
        <div className="nav-label">Workspace</div>
        {item('projects', 'folder', 'Projects', counts.projects, (r: Route) => ['projects', 'project', 'test', 'createProject', 'editTest', 'createRun'].includes(r.view))}
        {item('frameworks', 'layers', 'Frameworks', counts.frameworks, (r: Route) => ['frameworks', 'framework', 'addFramework'].includes(r.view))}
        <div className="nav-label">Execution</div>
        {item('active', 'activity', 'Active Runs', counts.active, (r: Route) => r.view === 'active' || r.view === 'runLive')}
        {item('agents', 'server', 'Agents', counts.agents)}
        {item('history', 'history', 'History')}
      </nav>
      <div className="sidebar-foot">
        <div className="nav-item" onClick={() => go({ view: 'settings' })}><Ic.settings/><span>Settings</span></div>
      </div>
    </aside>
  );
}

/* ---- Topbar ---- */
export function Topbar({ crumbs, theme, setTheme }: { crumbs: Crumb[], theme: string, setTheme: (theme: string) => void}) {
  return (
    <header className="topbar">
      <div className="crumbs">
        {crumbs.map((c: any, i: number) => (
          <React.Fragment key={i}>
            {i > 0 && <Ic.chevR className="crumb-sep" style={{ width: 14, height: 14 }}/>}
            <span className={cx('crumb', i === crumbs.length - 1 && 'cur')} onClick={c.go}>{c.label}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="topbar-spacer"/>
      <div className="searchbox">
        <Ic.search style={{ width: 15, height: 15 }}/>
        <input placeholder="Search projects, tests, runs…"/>
        <kbd>⌘K</kbd>
      </div>
      <div className="theme-seg">
        <button className={cx(theme === 'slate' && 'on')} onClick={() => setTheme('slate')}>Slate</button>
        <button className={cx(theme === 'carbon' && 'on')} onClick={() => setTheme('carbon')}>Carbon</button>
      </div>
      <div className="avatar">MR</div>
    </header>
  );
}

/* ---- Page head ---- */
export function PageHead({ eyebrow, title, desc, actions, badge }:{eyebrow?: React.ReactNode, badge?: React.ReactNode, title: React.ReactNode, desc?: React.ReactNode, actions?: React.ReactNode
}) {
  return (
    <div className="page-head">
      <div className="ph-text">
        {eyebrow && <div className="eyebrow">{eyebrow}{badge}</div>}
        <h1 className="page-title">{title}</h1>
        {desc && <p className="page-desc">{desc}</p>}
      </div>
      {actions && <div className="ph-actions">{actions}</div>}
    </div>
  );
}
/* ---- Button ---- */
interface BtnProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: string;
  sm?: boolean;
  icon?: IconName;
}

export function Btn({ kind, sm, icon, children, ...p }: BtnProps) {
  const Icon = icon ? Ic[icon] : null;
  return <button className={cx('btn', kind, sm && 'sm')} {...p}>{Icon && <Icon/>}{children}</button>;
}

interface IconBtnProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
}
export function IconBtn({ icon, ...p }: IconBtnProps) { const Icon = Ic[icon]; return <button className="icon-btn" {...p}><Icon/></button>; }

/* ---- Panel ---- */
interface PanelProps {
  title?: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
  pad?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function Panel({ title, sub, right, children, pad = true, className, style }: PanelProps) {
  return (
    <div className={cx('panel', className)} style={style}>
      {(title || right) && (
        <div className="panel-head">
          {title && <h3>{title}</h3>}{sub && <span className="sub">{sub}</span>}
          {right && <div className="right">{right}</div>}
        </div>
      )}
      {pad ? <div className="panel-body">{children}</div> : children}
    </div>
  );
}

/* ---- Stat tile ---- */
interface StatProps {
  k: React.ReactNode;
  icon?: IconName;
  v: React.ReactNode;
  unit?: React.ReactNode;
  delta?: React.ReactNode;
  deltaDir?: string;
}
export function Stat({ k, icon, v, unit, delta, deltaDir }: StatProps) {
  const Icon = icon ? Ic[icon] : null;
  return (
    <div className="stat">
      <div className="k">{Icon && <Icon style={{ width: 14, height: 14 }}/>}{k}</div>
      <div className="v">{v}{unit && <small>{unit}</small>}</div>
      {delta && <div className={cx('d', deltaDir)}>{delta}</div>}
    </div>
  );
}

/* ---- Tabs ---- */
export function Tabs({ tabs, active, onChange }: {tabs: TabItem[], active: string, onChange: (id: string) => void}) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <div key={t.id} className={cx('tab', active === t.id && 'on')} onClick={() => onChange(t.id)}>
          {t.icon && React.createElement(Ic[t.icon], { style: { width: 15, height: 15 } })}
          {t.label}{t.count != null && <span className="count">{t.count}</span>}
        </div>
      ))}
    </div>
  );
}

/* ---- Modal ---- */

interface ModalProps {
  title?: React.ReactNode;
  children?: React.ReactNode;
  foot?: React.ReactNode;
  wide?: boolean;
  onClose: () => void;
}

export function Modal({ title, onClose, children, foot, wide }: ModalProps) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" style={wide ? { maxWidth: 720 } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3><div style={{ marginLeft: 'auto' }}><IconBtn icon="x" onClick={onClose}/></div></div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

/* ---- Form fields ---- */
interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  children?: React.ReactNode;
}

export function Field({ label, hint, children }: FieldProps) {
  return <div className="field">{label && <label>{label}</label>}{children}{hint && <div className="hint">{hint}</div>}</div>;
}
export function Input(p: InputHTMLAttributes<HTMLInputElement> & {mono?: boolean}) { return <input className={cx('input', p.mono && 'mono')} {...p}/>; }
export function Select({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) { return <select className="select" {...p}>{children}</select>; }
export function Switch({ on, onClick }: {on: boolean, onClick?:  () => void}) { return <div className={cx('switch', on && 'on')} onClick={onClick}/>; }
export function Seg({ value, onChange, options }: {value: string, onChange: (value: string) => void, options: SegOption[]}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={cx(value === o.value && 'on')} onClick={() => onChange(o.value)}>
          {o.icon && React.createElement(Ic[o.icon])}{o.label}
        </button>
      ))}
    </div>
  );
}

/* ---- File chip ---- */
interface FileChipProps {
  name: string;
  kind?: string;
  size?: string;
  onRemove?: () => void;
}
export function FileChip({ name, kind, size, onRemove }: FileChipProps) {
  const ext = (kind || name.split('.').pop())?.toLowerCase() ;
  const k = ext === 'jmx' ? 'jmx' : ext === 'jar' ? 'jar' : ext === 'csv' ? 'csv' : 'neutral';
  return (
    <div className="filechip">
      <div className={cx('fi', k)}>{ext?.toUpperCase().slice(0, 3)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
        {size && <div className="muted" style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>{size}</div>}
      </div>
      {onRemove && <IconBtn icon="x" onClick={onRemove}/>}
    </div>
  );
}

/* ---- Empty state ---- */
interface EmptyProps {
  icon?: IconName;
  title: React.ReactNode;
  desc?: React.ReactNode;
  action?: React.ReactNode;
}
export function Empty({ icon, title, desc, action }: EmptyProps) {
  const Icon = Ic[icon || 'folder'];
  return <div className="empty"><Icon/><h4>{title}</h4>{desc && <div style={{ marginBottom: 16 }}>{desc}</div>}{action}</div>;
}

/* ---- Gauge bar ---- */
export function Gauge({ value, max, color }: {value: number, max: number, color?:string}) {
  const pct = Math.min(100, (value / max) * 100);
  const c = color || (pct > 85 ? 'var(--red)' : pct > 65 ? 'var(--amber)' : 'var(--accent)');
  return <div className="gauge-track"><div className="gauge-fill" style={{ width: pct + '%', background: c }}/></div>;
}

/* ---- Toasts ---- */
interface ToastsProps {
  items: ToastItem[];
}
export function Toasts({ items }: ToastsProps) {
  return (
    <div className="toast-wrap">
      {items.map((t) => (
        <div className="toast" key={t.id} style={t.color ? { borderLeftColor: t.color } : undefined}>
          {React.createElement(Ic[t.icon || 'check'], { style: { width: 18, height: 18, color: t.color || 'var(--accent)' } })}
          <div><div style={{ fontWeight: 600, fontSize: 13 }}>{t.title}</div>{t.msg && <div className="muted" style={{ fontSize: 12 }}>{t.msg}</div>}</div>
        </div>
      ))}
    </div>
  );
}

