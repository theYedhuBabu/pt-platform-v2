import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PageHead, Panel, Stat, Btn, Modal, Field, Input, Empty, FileChip, Seg,
} from '../components/design/Shell';
import { Icons as Ic } from '../components/design/Icons';
import {
  getFrameworks, createFramework, deleteFramework,
  type Framework,
  type FrameworkType,
  fetchFrameworkTypes,
  validateFrameworkFolderImport,
  filesFromDataTransfer,
} from '../services/framework';
import { getProjects, type Project } from '../services/projects';

// Mock (swap to this temporarily):
// import { getFrameworks, createFramework, deleteFramework, getProjects, type Framework, type Project } from '../services/mockService';

/* ---- Framework card ---- */
function FwCard({ fw, tool, onClick }: { fw: Framework; tool?: string; onClick: () => void }) {
  return (
    <div
      className="panel"
      style={{ cursor: 'pointer', background: 'var(--bg-2)' }}
      onClick={onClick}
    >
      <div className="panel-body" style={{ padding: 16 }}>
        <div className="flex gap8 mb16">
          <Ic.layers style={{ width: 18, height: 18, color: 'var(--blue)', flexShrink: 0 }} />
          <span
            className="mono"
            style={{ fontWeight: 600, fontSize: 13.5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {fw.name}
          </span>
        </div>
        <div className="dim" style={{ fontSize: 12.5, minHeight: 36 }}>{fw.description || 'No description'}</div>
        <div className="flex gap8" style={{ marginTop: 12 }}>
          {tool && <span className="badge neutral">{tool}</span>}
          {fw.version && <span className="ver">{fw.version}</span>}
        </div>
        <div className="divider" style={{ margin: '12px 0' }} />
        <div className="flex muted" style={{ fontSize: 11.5, gap: 14, fontFamily: 'var(--mono)' }}>
          <span>{fw.usageCount} test{fw.usageCount !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}

/* ---- Import Framework wizard ---- */
function ImportFrameworkModal({
  preselectedProjectId,
  projects,
  frameworkTypes,
  onClose,
  onDone,
  
}: {
  preselectedProjectId: string | null;
  projects: Project[];
  frameworkTypes: FrameworkType[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(1);
  const [src, setSrc] = useState('folder');
  const [projectId, setProjectId] = useState(preselectedProjectId ?? '');
  const [frameworkId, setFrameworkId] = useState('')
  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [desc, setDesc] = useState('');
  const [folderFiles, setFolderFiles] = useState<FileList | File[] | null>(null);
  const [pluginFile, setPluginFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [importError, setImportError] = useState('');

  const selectedFrameworkType = useMemo(
    () => frameworkTypes.find((type) => type.id === frameworkId) ?? null,
    [frameworkTypes, frameworkId],
  );
  const folderValidation = useMemo(
    () => src === 'folder' && selectedFrameworkType
      ? validateFrameworkFolderImport(folderFiles, selectedFrameworkType?.structure ?? '{}')
      : null,
    [src, folderFiles, selectedFrameworkType],
  );

  const folderReady = src !== 'folder' || folderValidation?.valid === true;
  const canAdvance = name.trim() !== '' && projectId !== '' && frameworkId !== '' && folderReady;

  const doImport = async () => {
    if (!canAdvance || !selectedFrameworkType) return;
    setSaving(true);
    setImportError('');
    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('sourceType', src === 'folder' ? 'upload' : 'git');
      fd.append('toolType', selectedFrameworkType.name);
      fd.append('frameworkType', selectedFrameworkType.id);
      if (desc.trim()) fd.append('description', desc.trim());
      if (version.trim()) fd.append('version', version.trim());
      if (folderValidation) {
        const sharedFiles = Array.from(new Set([
          ...folderValidation.sharedFiles,
          ...(pluginFile ? [pluginFile.name] : []),
        ]));
        folderValidation.entries.forEach((entry) => {
          // Go's multipart parser strips directories from filenames, so the
          // relative path must travel in a parallel `paths` field.
          fd.append('files', entry.file, entry.path);
          fd.append('paths', entry.path);
        });
        fd.append('splitFiles', JSON.stringify(folderValidation.splitFiles));
        fd.append('sharedFiles', JSON.stringify(sharedFiles));
        fd.append('scripts', String(folderValidation.counts.scripts));
        fd.append('configs', String(folderValidation.counts.configs));
        fd.append('data', String(folderValidation.counts.data));
        fd.append('plugins', String(folderValidation.counts.plugins + (pluginFile ? 1 : 0)));
        fd.append('util', String(folderValidation.counts.util));
      } else if (pluginFile) {
        fd.append('sharedFiles', JSON.stringify([pluginFile.name]));
        fd.append('plugins', '1');
      }
      if (pluginFile) fd.append('file', pluginFile);
      await createFramework(projectId, fd);
      onDone();
    } catch (e: unknown) {
      console.error(e);
      setImportError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setSaving(false);
    }
  };

  const foot =
    step === 1 ? (
      <>
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" icon="arrowR" disabled={!canAdvance} onClick={() => setStep(2)}>
          Parse package
        </Btn>
      </>
    ) : (
      <>
        <Btn kind="ghost" icon="chevL" onClick={() => setStep(1)}>Back</Btn>
        <Btn kind="primary" icon="check" disabled={saving} onClick={doImport}>
          {saving ? 'Importing…' : 'Import framework'}
        </Btn>
      </>
    );

  return (
    <Modal title="Import framework" onClose={onClose} wide foot={foot}>
      {step === 1 && (
        <>
          <Field label="Project">
            <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Framework Config">
            <select className="select" value={frameworkId} onChange={(e) => { setFrameworkId(e.target.value); setImportError(''); }}>
              <option value="">Select a Framework Type</option>
              {frameworkTypes.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
            
          </Field>
          <Field label="Source">
            <Seg
              value={src}
              onChange={setSrc}
              options={[
                { value: 'folder', label: 'Folder upload', icon: 'upload' },
                { value: 'git', label: 'Git clone', icon: 'link' },
              ]}
            />
          </Field>
          {src === 'folder' && (
            <Field label="Package folder" hint="Drag the built package (config/ src/ plugins/ …).">
              <input
                type="file"
                id="fw-folder-import"
                style={{ display: 'none' }}
                // @ts-expect-error -- webkitdirectory is not in React's types but is widely supported
                webkitdirectory=""
                multiple
                onChange={(e) => { setFolderFiles(e.target.files); setImportError(''); }}
              />
              <label htmlFor="fw-folder-import" style={{ display: 'contents', cursor: 'pointer' }}>
                <div
                  className="dropzone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const dropped = await filesFromDataTransfer(e.dataTransfer);
                    setFolderFiles(dropped);
                    setImportError('');
                  }}
                >
                  <Ic.upload />
                  {folderFiles
                    ? <div style={{ fontWeight: 600, color: 'var(--text-dim)' }}>{folderFiles.length} file{folderFiles.length !== 1 ? 's' : ''} selected</div>
                    : <div style={{ fontWeight: 600, color: 'var(--text-dim)' }}>Drop folder or click to browse</div>}
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    {selectedFrameworkType ? `Validated against ${selectedFrameworkType.label}` : 'Select a framework type first'}
                  </div>
                </div>
              </label>
              {folderValidation && (
                <div style={{ marginTop: 10, fontSize: 12.5 }}>
                  {folderValidation.valid ? (
                    <div style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      Package structure looks good: {folderValidation.matchedFiles.length} matched file{folderValidation.matchedFiles.length !== 1 ? 's' : ''}.
                    </div>
                  ) : (
                    <div style={{ color: 'var(--red)', fontWeight: 600 }}>
                      {folderValidation.errors[0]}
                    </div>
                  )}
                  {folderValidation.errors.slice(1, 4).map((error) => (
                    <div key={error} style={{ color: 'var(--red)', marginTop: 3 }}>{error}</div>
                  ))}
                  {folderValidation.warnings.slice(0, 3).map((warning) => (
                    <div key={warning} className="muted" style={{ marginTop: 3 }}>{warning}</div>
                  ))}
                </div>
              )}
            </Field>
          )}
          {src === 'git' && (
            <div className="row2">
              <Field label="Repository URL">
                <Input mono placeholder="git@github.com:org/suite.git" />
              </Field>
              <Field label="Branch">
                <Input mono placeholder="main" />
              </Field>
            </div>
          )}
          <div className="row2">
            <Field label="Framework name">
              <Input mono placeholder="checkout-core-suite" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Version">
              <Input mono value={version} onChange={(e) => setVersion(e.target.value)} />
            </Field>
          </div>
          <Field label="Description">
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What does this bundle include?" />
          </Field>
          <Field label="Plugin file" hint="Optional .jar or .zip bundle.">
            <input type="file" accept=".jar,.zip" id="fw-file-import" style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && setPluginFile(e.target.files[0])} />
            {pluginFile
              ? <FileChip name={pluginFile.name} kind="jar" onRemove={() => setPluginFile(null)} />
              : <label htmlFor="fw-file-import" className="btn ghost" style={{ cursor: 'pointer' }}>Choose .jar or .zip</label>}
          </Field>
        </>
      )}
      {step === 2 && (
        <div className="panel" style={{ background: 'var(--bg-2)' }}>
          <div className="panel-body">
            <div className="flex gap8 mb16">
              <Ic.check style={{ width: 18, height: 18, color: 'var(--accent)' }} />
              <strong>Ready to import</strong>
            </div>
            <dl className="kv" style={{ fontSize: 13 }}>
              <dt>Project</dt><dd className="mono">{projects.find(p => p.id === projectId)?.name ?? projectId}</dd>
              <dt>Framework type</dt><dd className="mono">{selectedFrameworkType?.label}</dd>
              <dt>Name</dt><dd className="mono">{name}</dd>
              <dt>Version</dt><dd className="mono">{version}</dd>
              {desc && <><dt>Description</dt><dd>{desc}</dd></>}
              <dt>Plugin</dt><dd className="mono">{pluginFile ? pluginFile.name : 'none'}</dd>
              <dt>Source</dt><dd className="mono">{src}</dd>
              {folderValidation && (
                <>
                  <dt>Parsed files</dt>
                  <dd className="mono">
                    {folderValidation.counts.scripts} scripts · {folderValidation.counts.data} data · {folderValidation.counts.plugins + (pluginFile ? 1 : 0)} plugins
                  </dd>
                </>
              )}
            </dl>
            {importError && <p style={{ color: 'var(--red)', marginTop: 12, fontSize: 13 }}>{importError}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ---- Main page ---- */
export default function Frameworks() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [importProjectId, setImportProjectId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Framework | null>(null);
  const [frameworkTypes, setFrameworkTypes] = useState<FrameworkType[]>([])


  const load = async () => {
    setLoading(true);
    try {
      const [ps, fws, fwt] = await Promise.all([getProjects(), getFrameworks(),  fetchFrameworkTypes()]);
      setProjects(ps);
      setFrameworks(fws);
      setFrameworkTypes(fwt);
      const o: Record<string, boolean> = {};
      ps.forEach((p) => { o[p.id] = true; });
      setOpen((prev) => ({ ...o, ...prev }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openImport = (projectId: string | null) => {
    setImportProjectId(projectId);
    setShowImport(true);
  };

  const closeImport = () => {
    setShowImport(false);
    setImportProjectId(null);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try { await deleteFramework(confirmDelete.id); setConfirmDelete(null); await load(); }
    catch (e) { console.error(e); }
  };

  return (
    <div className="page">
      <PageHead
        eyebrow="Workspace"
        title="Frameworks"
        desc="Built test packages, defined per project. Each bundles JMeter scripts, env configs, data files and plugins."
        actions={
          <Btn icon="plus" kind="primary" disabled={projects.length === 0} title={projects.length === 0 ? 'Create a project first' : undefined} onClick={() => openImport(null)}>Import framework</Btn>
        }
      />

      <div className="grid cols-4 mb24">
        <Stat k="Frameworks" icon="layers" v={frameworks.length} />
        <Stat k="Projects" icon="folder" v={projects.length} />
        <Stat k="In use" icon="link" v={frameworks.filter((f) => f.usageCount > 0).length} />
        <Stat k="Total uses" icon="beaker" v={frameworks.reduce((a, f) => a + f.usageCount, 0)} />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-mute)' }}>Loading…</div>
      ) : (
        <div className="grid" style={{ gap: 14 }}>
          {projects.map((p) => {
            const isOpen = open[p.id] !== false;
            const projectFws = frameworks.filter((fw) => fw.projectId === p.id);
            return (
              <div className="panel" key={p.id}>
                <div
                  className="panel-head"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}
                >
                  <Ic.chevD style={{ width: 16, height: 16, transform: isOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .15s', color: 'var(--text-mute)' }} />
                  <Ic.folder style={{ width: 16, height: 16, color: 'var(--text-dim)' }} />
                  <h3>{p.name}</h3>
                  <div className="right">
                    <span className="muted mono" style={{ fontSize: 12 }}>{projectFws.length} framework{projectFws.length !== 1 ? 's' : ''}</span>
                    <Btn sm kind="ghost" icon="plus" onClick={(e) => { e.stopPropagation(); openImport(p.id); }}>Import</Btn>
                  </div>
                </div>
                {isOpen && (
                  <div className="panel-body">
                    {projectFws.length === 0 ? (
                      <div className="muted" style={{ fontSize: 13, padding: '6px 2px' }}>
                        No frameworks yet — import one to start building tests.
                      </div>
                    ) : (
                      <div className="grid cols-3" style={{ gap: 12 }}>
                        {projectFws.map((fw) => (
                          <div key={fw.id} style={{ position: 'relative' }}>
                            <FwCard
                              fw={fw}
                              tool={frameworkTypes.find((t) => t.name === fw.toolType)?.tool || fw.toolType}
                              onClick={() => navigate(`/frameworks/${fw.id}`)}
                            />
                            <button
                              className="btn ghost sm"
                              style={{ position: 'absolute', top: 8, right: 8, color: 'var(--red)', padding: '4px 6px' }}
                              onClick={(e) => { e.stopPropagation(); setConfirmDelete(fw); }}
                            >
                              <Ic.trash style={{ width: 13, height: 13 }} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {projects.length === 0 && frameworks.length === 0 && (
            <Panel>
              <Empty
                icon="layers"
                title="No frameworks yet"
                desc="Frameworks belong to projects — create a project first, then import a framework bundle."
                action={<Btn kind="primary" icon="folder" onClick={() => navigate('/projects')}>Go to Projects</Btn>}
              />
            </Panel>
          )}
        </div>
      )}

      {showImport && (
        <ImportFrameworkModal
          preselectedProjectId={importProjectId}
          projects={projects}
          frameworkTypes={frameworkTypes}
          onClose={closeImport}
          onDone={() => { closeImport(); load(); }}
        />
      )}

      {confirmDelete && (
        <Modal
          title="Remove framework"
          onClose={() => setConfirmDelete(null)}
          foot={
            <>
              <Btn kind="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Btn>
              <Btn kind="danger" onClick={handleDelete}>Remove</Btn>
            </>
          }
        >
          <p>Remove <strong>{confirmDelete.name}</strong>?
            {confirmDelete.usageCount > 0 && ` It is referenced by ${confirmDelete.usageCount} test(s).`}
          </p>
        </Modal>
      )}
    </div>
  );
}
