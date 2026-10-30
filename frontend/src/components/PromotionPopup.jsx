import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const ATTR = 'fw_promo_attribution';
const money = (amount) => `£${Number(amount || 0).toLocaleString('en-GB')}`;

const visitorId = () => {
  let id = localStorage.getItem('fw_promo_visitor');

  if (!id) {
    id =
      globalThis.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random()}`;

    localStorage.setItem('fw_promo_visitor', id);
  }

  return id;
};

const device = () =>
  window.innerWidth < 640
    ? 'mobile'
    : window.innerWidth < 1024
      ? 'tablet'
      : 'desktop';

const excluded = path =>
  path === '/login' ||
  path === '/forgot-password' ||
  path === '/auth-callback' ||
  path === '/my-account/promotions' ||
  path.startsWith('/admin') ||
  path.startsWith('/production') ||
  path.startsWith('/legal/') ||
  path === '/terms' ||
  path === '/privacy' ||
  path === '/website-terms' ||
  path === '/mobile-terms';

const attribution = () => {
  const u = new URL(window.location.href);

  let saved = {};

  try {
    saved = JSON.parse(
      localStorage.getItem(ATTR) || '{}'
    );
  } catch {}

  const fresh = {
    source:
      u.searchParams.get('utm_source') ||
      saved.source ||
      (!document.referrer ? 'direct' : null),

    medium:
      u.searchParams.get('utm_medium') ||
      saved.medium ||
      null,

    campaign:
      u.searchParams.get('utm_campaign') ||
      saved.campaign ||
      null,

    term:
      u.searchParams.get('utm_term') ||
      saved.term ||
      null,

    content:
      u.searchParams.get('utm_content') ||
      saved.content ||
      null,

    referrer:
      saved.referrer ||
      document.referrer ||
      null,

    landing_page:
      saved.landing_page ||
      `${u.pathname}${u.search}`,

    first_seen_at:
      saved.first_seen_at ||
      new Date().toISOString()
  };

  localStorage.setItem(
    ATTR,
    JSON.stringify(fresh)
  );

  return fresh;
};

const track = (name, path, promotionId) => {
  const a = attribution();

  return api
    .post('/promotion/event', {
      event: name,
      promotion_id: promotionId,
      visitor_id: visitorId(),
      page:
        path ||
        window.location.pathname,
      device: device(),

      source: a.source,
      medium: a.medium,
      campaign: a.campaign,
      term: a.term,
      content: a.content,

      referrer: a.referrer,
      landing_page: a.landing_page
    })
    .catch(() => {});
};

export default function PromotionPopup() {
  const { user } = useAuth();

  const location = useLocation();
  const nav = useNavigate();

  const [cfg, setCfg] = useState(null);
  const [open, setOpen] = useState(false);

  const path = location.pathname;

  const seenKey = cfg?.promotion_id
    ? `promo_seen_${cfg.promotion_id}`
    : null;

  /*
   * LOGGED-IN USER POPUP LOCATIONS
   *
   * /
   *   -> World Selection
   *
   * /world
   *   -> Free World
   *
   * /paid-leagues
   *   -> Paid World
   */
  const loggedInPopupPages = [
    '/',
    '/world',
    '/paid-leagues'
  ];

  const eligible = useMemo(() => {
    if (
      !cfg?.is_live ||
      excluded(path)
    ) {
      return false;
    }

    /*
     * Logged-in users:
     * World Selection
     * Free World
     * Paid World
     */
    if (user) {
      return loggedInPopupPages.includes(
        path
      );
    }

    /*
     * Guest behaviour remains unchanged.
     */
    return true;
  }, [cfg, user, path]);

  useEffect(() => {
    attribution();

    api
      .get('/promotion/config')
      .then(r => setCfg(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (
      !cfg?.is_live ||
      !eligible
    ) {
      setOpen(false);
      return;
    }

    if (
      seenKey &&
      sessionStorage.getItem(
        seenKey
      ) === '1'
    ) {
      setOpen(false);
      return;
    }

    setOpen(true);

    track('impression', path, cfg?.promotion_id);
  }, [
    cfg?.promotion_id,
    cfg?.is_live,
    eligible,
    path,
    seenKey
  ]);

  if (
    !cfg?.is_live ||
    !eligible ||
    !open
  ) {
    return null;
  }

  const dismiss = () => {
    track('close', path, cfg?.promotion_id);

    if (seenKey) {
      sessionStorage.setItem(
        seenKey,
        '1'
      );
    }

    setOpen(false);
  };

  const rememberIntent = (
    intent,
    next
  ) => {
    sessionStorage.setItem(
      'fw_promo_intent',
      intent
    );

    sessionStorage.setItem(
      'fw_promo_next',
      next
    );

    sessionStorage.setItem(
      'fw_promo_origin',
      path
    );

    sessionStorage.setItem(
      'fw_promo_signup_started',
      '1'
    );

    if (seenKey) {
      sessionStorage.setItem(
        seenKey,
        '1'
      );
    }
  };

  const guest = (
    intent,
    next
  ) => {
    rememberIntent(
      intent,
      next
    );

    track('signup_start', path, cfg?.promotion_id);

    nav(
      `/login?tab=signup&promo=${encodeURIComponent(
        intent
      )}&next=${encodeURIComponent(
        next
      )}`
    );
  };

  const join = () => {
    track('join_click', path, cfg?.promotion_id);

    if (seenKey) {
      sessionStorage.setItem(
        seenKey,
        '1'
      );
    }

    setOpen(false);

    if (user) {
      sessionStorage.removeItem(
        'fw_promo_intent'
      );

      sessionStorage.removeItem(
        'fw_promo_next'
      );

      nav(
        cfg.join_url || '/my-account/promotions'
      );
    } else {
      guest(
        'join',
        cfg.join_url || '/my-account/promotions'
      );
    }
  };

  const refer = () => {
    track('refer_click', path, cfg?.promotion_id);

    if (seenKey) {
      sessionStorage.setItem(
        seenKey,
        '1'
      );
    }

    setOpen(false);

    if (user) {
      sessionStorage.removeItem(
        'fw_promo_intent'
      );

      sessionStorage.removeItem(
        'fw_promo_next'
      );

      nav(cfg.refer_url || '/refer');
    } else {
      guest(
        'refer',
        cfg.refer_url || '/refer'
      );
    }
  };

  const topup = () => {
    const next = cfg.topup_url || '/my-account/wallet?topup=1';
    track('topup_click', path, cfg?.promotion_id);
    if (seenKey) sessionStorage.setItem(seenKey, '1');
    setOpen(false);
    if (user) {
      sessionStorage.removeItem('fw_promo_intent');
      sessionStorage.removeItem('fw_promo_next');
      nav(next);
    } else {
      guest('topup', next);
    }
  };

  const img =
    cfg.mobile_image_url ||
    cfg.tablet_image_url ||
    cfg.desktop_image_url;

  return (
    <div
      className="
        fixed
        inset-0
        z-[100]

        bg-black/70
        backdrop-blur-sm

        flex
        items-center
        justify-center

        p-3
        sm:p-6
        2xl:p-10
      "
      role="dialog"
      aria-modal="true"
      aria-label={
        cfg.name ||
        'Promotion'
      }
    >
      <div
        className="
          relative

          w-[92vw]
          sm:w-[85vw]
          lg:w-[80vw]
          2xl:w-[76vw]

          max-w-5xl
          2xl:max-w-[1800px]

          max-h-[95vh]
          overflow-y-auto

          rounded-3xl
          2xl:rounded-[2.5rem]

          bg-[#0B0D1F]

          shadow-2xl

          border
          border-white/10
        "
      >
        {/* CLOSE */}
        <button
          onClick={dismiss}
          className="
            absolute

            right-3
            top-3

            2xl:right-5
            2xl:top-5

            z-10

            rounded-full

            bg-black/65
            hover:bg-black/80

            p-2.5
            2xl:p-4

            text-white
          "
          aria-label="Close promotion"
        >
          <X
            className="
              w-5
              h-5

              2xl:w-8
              2xl:h-8
            "
          />
        </button>

        {/*
          PROMOTION ARTWORK

          MOBILE:
          4:5
          1080 × 1350

          TABLET:
          4:3
          1600 × 1200

          DESKTOP:
          16:9
          3840 × 2160
        */}
        <div
          className="
            relative
            w-full

            aspect-[4/5]
            sm:aspect-[4/3]
            lg:aspect-video

            bg-[#0B0D1F]

            overflow-hidden
          "
        >
          {img ? (
            <picture
              className="
                block
                w-full
                h-full
              "
            >
              {/* DESKTOP 16:9 */}
              <source
                media="(min-width:1024px)"
                srcSet={
                  cfg.desktop_image_url ||
                  img
                }
              />

              {/* TABLET 4:3 */}
              <source
                media="(min-width:640px)"
                srcSet={
                  cfg.tablet_image_url ||
                  img
                }
              />

              {/* MOBILE 4:5 */}
              <img
                src={img}
                alt={
                  cfg.name ||
                  'Promotion'
                }
                className="
                  block
                  w-full
                  h-full
                  object-cover
                "
              />
            </picture>
          ) : cfg.promotion_type === 'offer' ? null : (
            <div
              className="
                absolute
                inset-0

                flex
                items-center
                justify-center

                text-white/40
                text-center

                px-6

                2xl:text-2xl
              "
            >
              <div>
                <div className="text-2xl font-black text-white">{cfg.name || 'Promotion'}</div>
                {cfg.description && <p className="mx-auto mt-2 max-w-xl text-sm text-white/70">{cfg.description}</p>}
                <div className="mt-4 text-sm font-bold text-yellow-300">
                  {cfg.campaign_type === 'token_credit'
                    ? `${cfg.reward_tokens || 0} bonus tokens`
                    : cfg.prize_total_gbp
                      ? `Prize pool ${money(cfg.prize_total_gbp)}`
                      : 'Claim your promotion entry'}
                </div>
              </div>
            </div>
          )}
        </div>

        {cfg.promotion_type !== 'offer' && (img || cfg.description || cfg.signup_offer_text || cfg.topup_offer_text) && <div className="px-4 pt-4 sm:px-6 text-white">
          {img && <h2 className="text-xl font-black">{cfg.name || 'Promotion'}</h2>}
          {cfg.description && img && <p className="mt-1 text-sm text-white/75">{cfg.description}</p>}
          {cfg.signup_offer_text && <p className="mt-2 text-sm font-bold text-yellow-300">{cfg.signup_offer_text}</p>}
          {cfg.topup_offer_text && <p className="mt-2 text-sm font-bold text-yellow-300">{cfg.topup_offer_text}</p>}
        </div>}

        {/* ACTION BUTTONS */}
        <div
          className="
            min-h-[16vh]

            p-4
            sm:p-6
            2xl:p-9

            grid
            grid-cols-1
            sm:grid-cols-1

            gap-3
            2xl:gap-6

            items-center

            bg-[#0B0D1F]
          "
        >
          {cfg.promotion_type !== 'offer' && cfg.promotion_type !== 'referral' && cfg.show_join !== false && <button
            onClick={join}
            className="
              w-full

              py-4
              2xl:py-6

              rounded-xl
              2xl:rounded-2xl

              bg-gradient-to-r
              from-[#FFD54A]
              to-[#FFB300]

              text-[#0B0D1F]

              font-black

              text-base
              sm:text-lg
              2xl:text-2xl
            "
          >
            {cfg.campaign_type === 'token_credit'
              ? 'CLAIM TOKEN REWARD'
              : cfg.campaign_type === 'ticket_draw'
                ? 'CLAIM YOUR ENTRY'
                : 'JOIN PROMOTION'}
          </button>}

          {cfg.show_refer !== false && <button
            onClick={refer}
            className="
              w-full

              py-4
              2xl:py-6

              rounded-xl
              2xl:rounded-2xl

              border-2
              border-[#FFD54A]

              text-[#FFD54A]

              font-black

              text-base
              sm:text-lg
              2xl:text-2xl
            "
          >
            REFER A FRIEND
          </button>}
          {cfg.promotion_type !== 'referral' && cfg.show_topup !== false && <button onClick={topup} className="w-full py-4 2xl:py-6 rounded-xl 2xl:rounded-2xl border-2 border-[#FFD54A] text-[#FFD54A] font-black text-base sm:text-lg 2xl:text-2xl">TOP UP</button>}
        </div>
      </div>
    </div>
  );
}