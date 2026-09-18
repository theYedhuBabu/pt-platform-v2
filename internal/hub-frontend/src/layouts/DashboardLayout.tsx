import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Sidebar, Topbar } from '../components/design/Shell';

function useBreadcrumbs(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: { label: string; path: string }[] = [];

  if (segments.length === 0) return crumbs;

  const [s0, s1, s2, s3, s4, s5] = segments;

  if (s0 === 'projects') {
    crumbs.push({ label: 'Projects', path: '/projects' });
    if (s1) {
      crumbs.push({ label: s1, path: `/projects/${s1}` });
      if (s2 === 'tests' && s3) {
        crumbs.push({ label: s3, path: `/projects/${s1}/tests/${s3}` });
        if (s4 === 'run') {
          crumbs.push({ label: 'Run', path: '' });
        } else if (s4 === 'runs' && s5) {
          crumbs.push({ label: s5, path: '' });
        }
      }
    }
  } else if (s0 === 'frameworks') {
    crumbs.push({ label: 'Frameworks', path: '/frameworks' });
    if (s1) crumbs.push({ label: s1, path: '' });
  } else if (s0 === 'active') {
    crumbs.push({ label: 'Active runs', path: '/active' });
  } else if (s0 === 'agents') {
    crumbs.push({ label: 'Agents', path: '/agents' });
  } else if (s0 === 'history') {
    crumbs.push({ label: 'History', path: '/history' });
  } else if (s0 === 'settings') {
    crumbs.push({ label: 'Settings', path: '/settings' });
  } else {
    crumbs.push({ label: s0.charAt(0).toUpperCase() + s0.slice(1), path: `/${s0}` });
  }

  return crumbs;
}

function sidebarView(pathname: string): string {
  const s = pathname.split('/').filter(Boolean);
  if (s[0] === 'projects') return 'projects';
  if (s[0] === 'frameworks') return 'frameworks';
  if (s[0] === 'active') return 'active';
  if (s[0] === 'agents') return 'agents';
  if (s[0] === 'history') return 'history';
  if (s[0] === 'settings') return 'settings';
  return s[0] || 'projects';
}

export default function DashboardLayout() {
  const [theme, setTheme] = useState(() => localStorage.getItem('jm_theme') || 'slate');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('jm_theme', theme);
  }, [theme]);

  const view = sidebarView(location.pathname);
  const route = { view };
  const counts = { projects: 0, frameworks: 0, active: null as any, agents: 0 };

  const rawCrumbs = useBreadcrumbs(location.pathname);
  const crumbs = rawCrumbs.map((c) => ({
    label: c.label,
    go: c.path ? () => navigate(c.path) : undefined,
  }));

  const handleGo = (r: { view: string }) => {
    const map: Record<string, string> = {
      projects: '/projects',
      frameworks: '/frameworks',
      active: '/active',
      agents: '/agents',
      history: '/history',
      settings: '/settings',
    };
    navigate(map[r.view] || `/${r.view}`);
  };

  return (
    <div className="app">
      <Sidebar route={route} go={handleGo} counts={counts} />
      <div className="main">
        <Topbar crumbs={crumbs} theme={theme} setTheme={setTheme} />
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
