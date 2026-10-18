import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import ReactMarkdown from 'react-markdown';

const SITE = 'https://prizeleague.co.uk';
const api = async (path) => {
  const res = await fetch('/api/opinly/' + path);
  if (!res.ok) throw new Error(res.status === 404 ? 'Article not found.' : 'Unable to load blog content.');
  return res.json();
};
const items = (value) => Array.isArray(value) ? value : (value?.data || value?.items || []);
const postImage = (post) => post?.heroImage?.url || post?.hero_image?.url || post?.heroImage || post?.hero_image || post?.image?.url || post?.image;
const summary = (post) => post?.description || post?.excerpt || post?.summary || '';
const title = (post) => post?.seo?.title || post?.metaTitle || post?.title || 'Prize League Blog';
const text = (value) => typeof value === 'string' ? value : '';
const safeImage = (value) => typeof value === 'string' && /^https:\/\//i.test(value) ? value : undefined;
function Meta({ name, property, content }) {
  useEffect(() => {
    if (!content) return undefined;
    const selector = name ? 'meta[name="' + name + '"]' : 'meta[property="' + property + '"]';
    let node = document.head.querySelector(selector);
    const old = node?.getAttribute('content');
    const created = !node;
    if (!node) {
      node = document.createElement('meta');
      node.setAttribute(name ? 'name' : 'property', name || property);
      document.head.appendChild(node);
    }
    node.setAttribute('content', content);
    return () => { if (created) node.remove(); else if (old !== null) node.setAttribute('content', old); };
  }, [name, property, content]);
  return null;
}
function SEO({ heading, description, path, image, article, schema }) {
  useEffect(() => {
    const previous = document.title;
    document.title = heading + ' | Prize League';
    let canonical = document.querySelector('link[rel="canonical"]');
    const previousHref = canonical?.getAttribute('href');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = SITE + path;
    return () => { document.title = previous; if (previousHref) canonical.href = previousHref; else canonical.remove(); };
  }, [heading, path]);
  return <>
    <Meta name="description" content={description || heading} />
    <Meta property="og:title" content={heading} />
    <Meta property="og:description" content={description || heading} />
    <Meta property="og:url" content={SITE + path} />
    <Meta property="og:type" content={article ? 'article' : 'website'} />
    {image && <Meta property="og:image" content={image} />}
    <Meta name="twitter:card" content="summary_large_image" />
    {schema && <JsonLd value={schema} />}
  </>;
}
function JsonLd({ value }) {
  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(value).replace(/</g, '\\u003c');
    document.head.appendChild(script);
    return () => script.remove();
  }, [value]);
  return null;
}
function useBlog(load, dependencies) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let active = true;
    setState({ loading: true });
    load().then(data => active && setState({ data, loading: false })).catch(error => active && setState({ error: error.message, loading: false }));
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
  return state;
}
function Status({ state, empty }) {
  if (state.loading) return <p role="status">Loading articles…</p>;
  if (state.error) return <p role="alert">{state.error} Please try refreshing this page.</p>;
  if (empty) return <p>No articles are published here yet.</p>;
  return null;
}
function Card({ post }) {
  if (!post?.slug) return null;
  const image = safeImage(postImage(post));
  const imageAlt = typeof post?.heroImage === 'object' ? post.heroImage?.alt : '';
  return <article className="rounded-xl border border-white/20 overflow-hidden bg-white/5">
    <Link to={'/blog/' + encodeURIComponent(post.slug)} className="block p-5 focus-visible:outline focus-visible:outline-2">
      {typeof image === 'string' && <img src={image} alt={text(imageAlt) || ''} loading="lazy" className="w-full h-44 object-cover rounded-lg mb-4" />}
      <h2 className="text-xl font-bold mb-2">{post.title}</h2>
      <p className="opacity-80">{summary(post)}</p>
      <span className="inline-block mt-3 underline">Read article</span>
    </Link>
  </article>;
}
export function BlogIndex({ filterCategory, filterAuthor }) {
  const [params, setParams] = useSearchParams();
  const cursor = params.get('cursor') || '';
  const [history, setHistory] = useState([]);
  const category = filterCategory || '';
  const author = filterAuthor || '';
  const state = useBlog(() => api('posts?' + new URLSearchParams({ limit: '12', sort: 'newest', cursor, category, author })), [cursor, category, author]);
  const posts = items(state.data);
  const heading = category ? 'Category: ' + category : author ? 'Articles by ' + author : 'Prize League Blog';
  return <main className="max-w-6xl mx-auto px-5 py-12 min-h-screen">
    <SEO heading={heading} description="Articles, tips and news from Prize League." path={category ? '/blog/category/' + category : author ? '/blog/author/' + author : '/blog'} />
    <h1 className="text-4xl font-bold mb-8">{heading}</h1>
    <Status state={state} empty={!posts.length} />
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{posts.map(p => <Card key={p.slug} post={p} />)}</div>
    {!state.loading && !state.error && <nav aria-label="Blog pagination" className="flex gap-4 mt-8">
      {history.length > 0 && <button type="button" className="underline" onClick={() => { const prior = history[history.length - 1]; setHistory(h => h.slice(0, -1)); setParams(prior ? { cursor: prior } : {}); }}>Previous</button>}
      {state.data?.has_more && state.data?.next_cursor && <button type="button" className="underline" onClick={() => { setHistory(h => [...h, cursor]); setParams({ cursor: state.data.next_cursor }); }}>Next articles</button>}
    </nav>}
  </main>;
}
export function BlogCategory() { const { slug } = useParams(); return <BlogIndex key={slug} filterCategory={slug} />; }
export function BlogAuthor() { const { slug } = useParams(); return <BlogIndex key={slug} filterAuthor={slug} />; }
export function BlogPost() {
  const { slug } = useParams();
  const state = useBlog(() => api('post?slug=' + encodeURIComponent(slug)), [slug]);
  const p = state.data?.data || state.data;
  const image = p && safeImage(postImage(p));
  const heroAlt = typeof p?.heroImage === 'object' ? p.heroImage?.alt : '';
  const path = '/blog/' + encodeURIComponent(slug);
  const schema = p && { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: summary(p), mainEntityOfPage: SITE + path, ...(image ? { image } : {}), ...(p.publishedAt ? { datePublished: p.publishedAt } : {}), ...(p.updatedAt ? { dateModified: p.updatedAt } : {}), author: { '@type': 'Person', name: p.author?.name || p.authorName || 'Prize League' }, publisher: { '@type': 'Organization', name: 'Prize League' } };
  return <main className="max-w-3xl mx-auto px-5 py-12 min-h-screen">
    <Status state={state} />
    {p && <article>
      <SEO heading={title(p)} description={p.seo?.description || summary(p)} path={path} image={typeof image === 'string' ? image : undefined} article schema={schema} />
      <nav aria-label="Breadcrumb" className="mb-6"><Link to="/blog" className="underline">Blog</Link> / <span>{p.title}</span></nav>
      <h1 className="text-4xl font-bold mb-4">{p.title}</h1>
      {p.publishedAt && <time dateTime={p.publishedAt} className="block opacity-70 mb-6">{new Date(p.publishedAt).toLocaleDateString('en-GB')}</time>}
      {typeof image === 'string' && <img src={image} alt={text(heroAlt) || ''} className="w-full rounded-xl mb-8" />}
      <div className="prose prose-invert max-w-none leading-relaxed">
        {typeof p.bodyHtml === 'string' || typeof p.html === 'string' ? <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(p.bodyHtml || p.html) }} /> : <ReactMarkdown>{text(p.bodyMarkdown || p.markdown || p.body || p.content)}</ReactMarkdown>}
      </div>
    </article>}
  </main>;
}
