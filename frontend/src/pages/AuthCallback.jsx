import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import GoogleFinalizeModal from '../components/auth/GoogleFinalizeModal';

export default function AuthCallback() {
  const nav = useNavigate();

  const {
    setGoogleUser,
    refresh,
    user,
  } = useAuth();

  const done = useRef(false);

  const [needsFinalize, setNeedsFinalize] =
    useState(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    (async () => {
      // NEW direct Google flow:
      // Login.jsx has already verified Google via /api/auth/google
      // and stored the Prize League JWT.
      const directFinalize =
        sessionStorage.getItem(
          'pl_google_needs_finalize'
        ) === '1';

      if (directFinalize) {
        sessionStorage.removeItem(
          'pl_google_needs_finalize'
        );

        setNeedsFinalize(true);
        return;
      }

      // Legacy Emergent OAuth compatibility while old links/sessions expire.
      const hash =
        window.location.hash || '';

      const m =
        hash.match(/session_id=([^&]+)/);

      if (m) {
        try {
          const r =
            await authAPI.googleSession?.(
              m[1]
            );

          if (r?.session_token) {
            localStorage.setItem(
              'gz_token',
              r.session_token
            );
          }

          if (r?.user) {
            setGoogleUser(r.user);
          }

          window.history.replaceState(
            null,
            '',
            '/'
          );

          const u = r?.user;

          const needsPhone =
            !u?.phone_verified;

          const needsTerms =
            !u?.terms_accepted_at;

          if (
            needsPhone ||
            needsTerms ||
            !u?.dob
          ) {
            setNeedsFinalize(true);
          } else {
            nav('/', {
              replace: true,
            });
          }

          return;
        } catch {
          nav('/login', {
            replace: true,
          });
          return;
        }
      }

      // If direct Google user is already hydrated and complete.
      if (user) {
        const incomplete =
          !user?.phone_verified ||
          !user?.terms_accepted_at ||
          !user?.dob;

        if (incomplete) {
          setNeedsFinalize(true);
        } else {
          nav('/', {
            replace: true,
          });
        }

        return;
      }

      // Try hydrating JWT saved by direct Google login.
      try {
        const me =
          await authAPI.me();

        if (me) {
          setGoogleUser(me);

          const incomplete =
            !me?.phone_verified ||
            !me?.terms_accepted_at ||
            !me?.dob;

          if (incomplete) {
            setNeedsFinalize(true);
          } else {
            nav('/', {
              replace: true,
            });
          }

          return;
        }
      } catch {
        // fall through
      }

      nav('/login', {
        replace: true,
      });
    })();
  }, [
    nav,
    setGoogleUser,
    user,
  ]);

  const onFinalized = async () => {
    sessionStorage.removeItem(
      'pl_google_referral_code'
    );

    localStorage.removeItem(
      'pl_referral_code'
    );

    await refresh?.();

    nav('/', {
      replace: true,
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center pl-hero-bg">
      {!needsFinalize && (
        <div className="text-center">
          <div className="w-12 h-12 mx-auto rounded-full border-4 border-[#FFD54A] border-t-transparent animate-spin" />
          <p className="mt-4 text-white/80">
            Signing you in…
          </p>
        </div>
      )}

      <GoogleFinalizeModal
        open={needsFinalize}
        onComplete={onFinalized}
      />
    </div>
  );
}
