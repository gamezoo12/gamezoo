import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { countryAPI } from '../lib/api';
import CountrySelect from './CountrySelect';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

export default function ProfileCountry() {
  const { user, refresh } = useAuth();
  const [next, setNext] = useState('');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const access = user?.country_access;
  const pending = user?.country_change_pending;
  const submit = async () => {
    setMsg('');
    try {
      if (!user.country_of_residence) await countryAPI.setMine(next);
      else await countryAPI.requestChange(next, reason);
      setMsg(user.country_of_residence ? 'Request sent. Our team will review it.' : 'Country saved.');
      setNext(''); await refresh();
    } catch (e) { setMsg(typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : 'Could not save.'); }
  };
  return (
    <div className="md:col-span-2 rounded-xl border border-slate-200 p-3" data-testid="profile-country">
      <Label>Country of residence</Label>
      <p className="mt-1 text-sm font-semibold text-slate-900" data-testid="profile-country-value">{access?.country_name || 'Not recorded yet'}</p>
      {access?.notice && <p className="mt-1 text-xs text-amber-800">{access.notice}</p>}
      {pending ? <p className="mt-2 text-xs text-slate-600" data-testid="profile-country-pending">Change to {pending.requested_country} is waiting for approval.</p> : (
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <CountrySelect value={next} onChange={setNext} testId="profile-country-select" />
          {user?.country_of_residence && <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. moved home)" data-testid="profile-country-reason" />}
          <Button type="button" disabled={!next} onClick={submit} data-testid="profile-country-submit">{user?.country_of_residence ? 'Request change' : 'Confirm country'}</Button>
        </div>
      )}
      {msg && <p className="mt-1 text-xs text-slate-600" data-testid="profile-country-msg">{msg}</p>}
    </div>
  );
}
