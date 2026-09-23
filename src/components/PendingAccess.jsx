import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function PendingAccess({ profile, onRefresh, onSignOut }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ fullName: profile.fullName, phone: profile.phone || '',
    email: profile.email, warrantNumber: profile.warrantNumber || '', isProvisional: profile.isProvisional });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const change = event => setForm(previous => ({ ...previous, [event.target.name]:
    event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const save = async event => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const { error } = await supabase.rpc('update_pending_profile', {
        p_full_name: form.fullName.trim(), p_phone: form.phone.trim(),
        p_warrant_number: form.warrantNumber.trim(), p_is_provisional: Boolean(form.isProvisional)
      });
      if (error) throw error;
      if (form.email.trim().toLowerCase() !== profile.email.toLowerCase()) {
        const { error: emailError } = await supabase.auth.updateUser({ email: form.email.trim().toLowerCase() });
        if (emailError) throw new Error(`Profile saved, but the email change failed: ${emailError.message}`);
        setMessage('Profile saved. Please follow the email-change confirmation instructions sent to your email address. Your existing email remains in use until the change is confirmed.');
      } else setMessage('Profile saved. Your application is still awaiting AJPA approval.');
      await onRefresh();
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  };
  return (
    <main className="min-h-screen bg-slate-100 p-6 flex items-center justify-center">
      <section className="w-full max-w-md rounded-xl bg-white p-6 shadow space-y-4">
        <h1 className="text-2xl font-bold">Awaiting approval</h1>
        <p>Your AJPA application is awaiting Registrar approval. Email confirmation and AJPA membership approval are separate steps.</p>
        {!editing ? <button type="button" onClick={() => setEditing(true)} className="rounded bg-slate-900 text-white px-4 py-2">Maintain Profile</button> : (
          <form onSubmit={save} className="space-y-3">
            {[
              ['fullName', 'Full legal name', 'text'], ['phone', 'Phone', 'tel'],
              ['warrantNumber', 'JP warrant number', 'text'], ['email', 'Email', 'email']
            ].map(([name, label, type]) => <label key={name} className="block">
              {label}<input name={name} type={type} value={form[name]} onChange={change}
                required={name !== 'phone'} disabled={saving} className="block w-full border rounded p-2" />
            </label>)}
            <label className="block"><input type="checkbox" name="isProvisional" checked={form.isProvisional}
              onChange={change} disabled={saving} /> Provisional JP</label>
            <div className="flex gap-2">
              <button disabled={saving} className="rounded bg-slate-900 text-white px-4 py-2">{saving ? 'Saving…' : 'Save Profile'}</button>
              <button type="button" disabled={saving} onClick={() => {
                setForm({ fullName: profile.fullName, phone: profile.phone || '', email: profile.email,
                  warrantNumber: profile.warrantNumber || '', isProvisional: profile.isProvisional });
                setMessage('');
                setEditing(false);
              }} className="rounded border border-slate-300 px-4 py-2">Cancel</button>
            </div>
          </form>
        )}
        {message && <p role="status">{message}</p>}
        <button type="button" onClick={onSignOut} className="block underline">Sign Out</button>
      </section>
    </main>
  );
}
