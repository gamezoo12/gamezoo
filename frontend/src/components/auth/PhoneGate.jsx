import { useEffect, useState } from 'react';
import PhoneOtpModal from './PhoneOtpModal';
import { useAuth } from '../../context/AuthContext';

// Opens the OTP modal when the backend rejects an action with PHONE_VERIFICATION_REQUIRED.
export default function PhoneGate() {
  const { user, refresh } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onRequired = () => setOpen(true);
    window.addEventListener('pl:phone-required', onRequired);
    return () => window.removeEventListener('pl:phone-required', onRequired);
  }, []);

  if (!user) return null;
  return (
    <PhoneOtpModal
      open={open}
      onDismiss={() => setOpen(false)}
      onVerified={async () => { setOpen(false); await refresh?.(); }}
    />
  );
}
