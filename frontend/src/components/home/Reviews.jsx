import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { publicAPI } from '../../lib/api';
import { resolveMediaUrl } from '../../lib/media';
import { relativeTime } from './WinnersGallery';

export default function Reviews() {
  const [data, setData] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    publicAPI.homepageContent().then(setData).catch(() => setData(null));
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const reviews = data?.reviews || [];
  if (!reviews.length) return null;
  const count = Math.max(Number(data?.review_count) || 0, reviews.length);

  return (
    <section className="bg-slate-50 py-14" data-testid="homepage-reviews">
      <div className="mx-auto max-w-5xl px-4 lg:px-8">
        <div className="mb-8 text-center">
          <div className="mb-2 inline-flex items-center gap-2">
            {[0, 1, 2, 3, 4].map((index) => <Star key={index} className="h-5 w-5 fill-amber-500 stroke-amber-500" />)}
            <span className="text-sm font-semibold text-slate-700">{Number(data?.review_rating || 5).toFixed(1)} / 5 · {count.toLocaleString()} reviews</span>
          </div>
          <h2 className="font-display text-3xl font-extrabold text-slate-900 md:text-4xl">What our players say</h2>
          {data?.google_review_url && <a className="mt-2 inline-block text-sm font-bold text-[#6C2BFF] hover:underline" href={data.google_review_url} target="_blank" rel="noreferrer">Read on Google</a>}
        </div>
        <div className="max-h-[430px] space-y-3 overflow-y-auto overscroll-contain pr-2" data-testid="homepage-review-scroll">
          {reviews.map((review) => (
            <article key={review.content_id} className="flex gap-4 rounded-lg border border-slate-200 bg-white p-4">
              {review.image_url && <img src={resolveMediaUrl(review.image_url)} alt="Review" className="h-20 w-20 shrink-0 rounded-md object-cover" loading="lazy" />}
              <div className="min-w-0">
                <div className="mb-2 flex gap-1">{Array.from({ length: review.rating || 5 }).map((_, index) => <Star key={index} className="h-4 w-4 fill-amber-500 stroke-amber-500" />)}</div>
                <p className="text-sm leading-relaxed text-slate-700">{review.text}</p>
                <div className="mt-3 text-xs text-slate-500"><span className="font-semibold text-slate-900">{review.name}</span> · {relativeTime(review.created_at, now)}</div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
