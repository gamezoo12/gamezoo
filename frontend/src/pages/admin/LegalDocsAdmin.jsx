import { useEffect, useState } from 'react';
import { adminAPI } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useToast } from '../../hooks/use-toast';
import { useAuth } from '../../context/AuthContext';
import {
  FileText, Save, Send, Download, AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react';

const StatusPill = ({ status }) => {
  const cls = status === 'published'
    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : 'bg-amber-100 text-amber-800 border-amber-200';
  const Icon = status === 'published' ? CheckCircle2 : Clock;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${cls}`}>
      <Icon className="w-3 h-3" /> {status}
    </span>
  );
};

export default function LegalDocsAdmin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [docs, setDocs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin';

  const refreshList = () =>
    adminAPI.legalList().then(r => setDocs(r.documents || []));

  useEffect(() => { refreshList(); }, []);

  const openDoc = async (slug) => {
    const d = await adminAPI.legalGet(slug);
    setSelected(d);
    setContent(d.content || '');
    setTitle(d.title || '');
    setChangeNote('');
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await adminAPI.legalSave(selected.slug, { title, content, change_note: changeNote });
      toast({ title: 'Draft saved', description: `Version bumped for ${selected.title}` });
      await refreshList();
      await openDoc(selected.slug);
    } catch (err) {
      toast({ title: 'Save failed', description: err?.response?.data?.detail || err.message });
    } finally { setSaving(false); }
  };

  const publish = async () => {
    if (!selected) return;
    if (!window.confirm(`Publish "${selected.title}" as the current live version? This makes it public at /legal/${selected.slug}.`)) return;
    setPublishing(true);
    try {
      await adminAPI.legalPublish(selected.slug);
      toast({ title: 'Published', description: 'This is now the live version.' });
      await refreshList();
      await openDoc(selected.slug);
    } catch (err) {
      toast({ title: 'Publish failed', description: err?.response?.data?.detail || err.message });
    } finally { setPublishing(false); }
  };

  return (
    <div className="p-6" data-testid="legal-docs-admin">
      <div className="flex items-center gap-2 mb-1">
        <FileText className="w-5 h-5 text-indigo-600" />
        <h1 className="font-display font-extrabold text-2xl">Legal Documents</h1>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        {docs.length} policies · Only <strong>Super Admin</strong> can publish.
        Editing bumps the version and archives the previous copy.
      </p>

      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        {/* List */}
        <ul className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-2">
          {docs.map(d => (
            <li key={d.slug}>
              <button
                onClick={() => openDoc(d.slug)}
                data-testid={`legal-doc-${d.slug}`}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition ${
                  selected?.slug === d.slug
                    ? 'border-indigo-400 bg-indigo-50'
                    : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-sm truncate">{d.title}</div>
                  <StatusPill status={d.status} />
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                  <span>v{d.version}</span>
                  <span>·</span>
                  <span className="truncate">{d.owner}</span>
                  {d.ai_generated && (
                    <span className="ml-auto inline-flex items-center gap-0.5 text-amber-600">
                      <AlertTriangle className="w-3 h-3" /> AI draft
                    </span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>

        {/* Editor */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          {!selected ? (
            <div className="text-slate-500 text-sm py-16 text-center">
              Select a policy on the left to edit.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex-1 min-w-0">
                  <Label className="text-[11px] uppercase tracking-wider">Title</Label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} data-testid="legal-edit-title" />
                  <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-2 items-center">
                    <span>Slug: <code className="text-indigo-700">{selected.slug}</code></span>
                    <span>·</span>
                    <span>v{selected.version}</span>
                    <span>·</span>
                    <StatusPill status={selected.status} />
                    <span>·</span>
                    <span>Owner: {selected.owner}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <Button variant="outline" asChild size="sm">
                    <a
                      href={adminAPI.legalDownloadUrl(selected.slug)}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="legal-download"
                    >
                      <Download className="w-4 h-4 mr-1" /> Download .md
                    </a>
                  </Button>
                </div>
              </div>

              {selected.ai_generated && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs px-3 py-2 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>AI-drafted placeholder.</strong> Requires review and approval by a qualified
                    UK solicitor / compliance adviser before publication.
                  </span>
                </div>
              )}

              <Label className="text-[11px] uppercase tracking-wider">Content (Markdown)</Label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={20}
                className="w-full font-mono text-sm rounded-lg border border-slate-200 p-3 mt-1 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                data-testid="legal-edit-content"
              />

              <div className="mt-3">
                <Label className="text-[11px] uppercase tracking-wider">Change note (optional)</Label>
                <Input
                  value={changeNote}
                  onChange={e => setChangeNote(e.target.value)}
                  placeholder="e.g. Updated section 5 to reflect new refund window"
                  data-testid="legal-change-note"
                />
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  onClick={save}
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700"
                  data-testid="legal-save-draft"
                >
                  <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving…' : 'Save draft'}
                </Button>
                <Button
                  onClick={publish}
                  disabled={publishing || !isSuperAdmin}
                  className="bg-emerald-600 hover:bg-emerald-700"
                  title={!isSuperAdmin ? 'Only Super Admin can publish' : ''}
                  data-testid="legal-publish"
                >
                  <Send className="w-4 h-4 mr-1" /> {publishing ? 'Publishing…' : 'Publish (Super Admin)'}
                </Button>
                {!isSuperAdmin && (
                  <span className="text-xs text-amber-700 self-center">
                    Publishing is restricted to Super Admin.
                  </span>
                )}
              </div>

              {selected.version_history?.length > 0 && (
                <div className="mt-8">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Version history
                  </div>
                  <ul className="text-xs divide-y divide-slate-100">
                    {selected.version_history.map(v => (
                      <li key={v.version} className="py-2 flex items-center gap-3">
                        <span className="font-mono text-slate-600">v{v.version}</span>
                        <span className="text-slate-500">{new Date(v.saved_at).toLocaleString('en-GB')}</span>
                        <span className="text-slate-500">by {v.saved_by}</span>
                        {v.change_note && (
                          <span className="text-slate-700 truncate">— {v.change_note}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
