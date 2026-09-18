import type React from "react";



/* Simple stroke icons (feather-style geometric paths) */
const Ic: Record<string, React.FC<React.SVGProps<SVGSVGElement>>> = {};
function mk(paths: React.ReactNode, opts?: { fill?: boolean; sw?: number }){
  return function Icon(props: React.SVGProps<SVGSVGElement>) {
    const o = opts || {};
    return (
      <svg viewBox="0 0 24 24" fill={o.fill ? 'currentColor' : 'none'} stroke={o.fill ? 'none' : 'currentColor'}
        strokeWidth={o.sw || 1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
        {paths}
      </svg>
    );
  };
}
Ic.grid = mk(<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>);
Ic.folder = mk(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>);
Ic.layers = mk(<><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17l9 5 9-5"/></>);
Ic.beaker = mk(<><path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7 15h10"/></>);
Ic.activity = mk(<path d="M3 12h4l3 8 4-16 3 8h4"/>);
Ic.server = mk(<><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><circle cx="7" cy="7.5" r=".6" fill="currentColor"/><circle cx="7" cy="16.5" r=".6" fill="currentColor"/></>);
Ic.clock = mk(<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>);
Ic.plus = mk(<><path d="M12 5v14"/><path d="M5 12h14"/></>);
Ic.play = mk(<path d="M7 4l13 8-13 8z"/>, { fill: true });
Ic.playO = mk(<><circle cx="12" cy="12" r="9"/><path d="M10 8l6 4-6 4z"/></>);
Ic.stop = mk(<rect x="6" y="6" width="12" height="12" rx="2"/>, { fill: true });
Ic.settings = mk(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></>);
Ic.search = mk(<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></>);
Ic.chevR = mk(<path d="M9 6l6 6-6 6"/>);
Ic.chevL = mk(<path d="M15 6l-6 6 6 6"/>);
Ic.chevD = mk(<path d="M6 9l6 6 6-6"/>);
Ic.arrowR = mk(<><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></>);
Ic.arrowUp = mk(<><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></>);
Ic.check = mk(<path d="M5 12l5 5 9-11"/>);
Ic.x = mk(<><path d="M6 6l12 12"/><path d="M18 6L6 18"/></>);
Ic.upload = mk(<><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/></>);
Ic.download = mk(<><path d="M12 4v12"/><path d="M7 11l5 5 5-5"/><path d="M4 19h16"/></>);
Ic.file = mk(<><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/></>);
Ic.copy = mk(<><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></>);
Ic.edit = mk(<><path d="M4 20h16"/><path d="M14 4l4 4-9 9-4 1 1-4z"/></>);
Ic.trash = mk(<><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13h10l1-13"/></>);
Ic.more = mk(<><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></>);
Ic.history = mk(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/></>);
Ic.alert = mk(<><path d="M12 3l9 16H3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".7" fill="currentColor"/></>);
Ic.bolt = mk(<path d="M13 3L4 14h6l-1 7 9-11h-6z"/>);
Ic.cpu = mk(<><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></>);
Ic.gauge = mk(<><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M12 12l4-4"/><path d="M4 18a9 9 0 1 1 16 0"/></>);
Ic.target = mk(<><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8" fill="currentColor"/></>);
Ic.link = mk(<><path d="M10 14a4 4 0 0 0 6 .5l3-3a4 4 0 0 0-6-6l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-6-.5l-3 3a4 4 0 0 0 6 6l1.5-1.5"/></>);
Ic.tag = mk(<><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.3"/></>);
Ic.dot = mk(<circle cx="12" cy="12" r="4"/>, { fill: true });
Ic.refresh = mk(<><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v5h-5"/></>);
Ic.users = mk(<><circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6"/><path d="M18 20a6 6 0 0 0-3-5.2"/></>);
Ic.calendar = mk(<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>);


export { Ic as Icons };
