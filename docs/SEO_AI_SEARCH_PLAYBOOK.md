# RealMindX SEO and AI Search Playbook

## Operating principles

- Publish pages that answer a real learner, parent, teacher, or school question using verified RealMindX information.
- Keep one canonical URL for each product, job, service, article, and catalogue concept.
- Do not publish invented reviews, credentials, partnerships, statistics, authors, or FAQ claims.
- AI training access and AI search access are separate decisions. RealMindX may block training crawlers while allowing answer/search crawlers.
- Cloudflare controls verified crawler access separately from `robots.txt`. Keep `OAI-SearchBot` unblocked in Cloudflare's AI Crawl Control when AI search visibility is desired. The automated health check validates the published `robots.txt` policy; it does not impersonate a verified bot.

## Monthly search review

1. Review Google Search Console and Bing Webmaster Tools for indexing, sitemap, canonical, rich-result, and Core Web Vitals issues.
2. Review the RealMindX Analytics "AI search referrals" panel and traffic-source conversions.
3. Run `python scripts/seo_smoke_check.py` and investigate every failure.
4. Review new 404s and redirect only genuine legacy equivalents. Do not redirect unrelated missing pages to the homepage.
5. Check published jobs for expired deadlines and published products for discontinued or duplicate URLs.
6. Update high-impression pages whose title or description does not match the search intent.

## Content standards

Every important service or catalogue page should state:

- who the offering is for;
- the Ghanaian curriculum, school level, subject, or location context where applicable;
- what is included and what is not included;
- how fulfilment, delivery, application, or enquiry works;
- when the information was last reviewed;
- a clear route to a relevant product, job, service, resource, or contact action.

News and guidance articles should identify a responsible organization or named author/reviewer when that information is real. Cite primary sources for curriculum, examination, regulatory, and policy claims.

## Recommended topic clusters

- Ghana teaching jobs: qualification, NTC licensing, application preparation, subject and level guides.
- Ghana curricula: GES/NaCCA, BECE, WASSCE, Cambridge, subject and level reading lists.
- School improvement: teacher recruitment, CPD, school systems, inclusive education, and tutoring.
- Book purchasing: edition selection, delivery coverage, bulk school orders, returns, and availability.

Each cluster should link to its relevant service, job, product, taxonomy, and published resource pages.

## External authority work

The following requires genuine outreach rather than code:

- Ask partner schools and publishers to link to the relevant RealMindX service or catalogue page.
- Maintain accurate organization records on legitimate Ghanaian business and education directories.
- Pitch evidence-backed education commentary to credible publications.
- Publish original data or practical resources that schools and teachers naturally reference.
- Correct inconsistent business name, address, phone, and website citations.

## Webmaster account setup

1. Add repository variables `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` after obtaining the values from the account owners.
2. Deploy and confirm the verification meta tags appear in server-rendered HTML.
3. Submit:
   - `https://realmindxgh.com/sitemap.xml`
   - `https://bookshop.realmindxgh.com/sitemap.xml`
4. Never store account passwords or access tokens in the repository.

## Failure notifications

- Add the existing Resend API key as the GitHub Actions repository secret `RESEND_API_KEY`.
- Daily SEO-check failures and deployment/post-deployment failures email `info@realmindxgh.com`.
- The email links directly to the failed Actions run and includes the SEO report when one was produced.
- If the GitHub secret is absent, the Actions log emits an explicit warning and does not expose or recover credentials from the production server.

## Release gates

- Production frontend build succeeds.
- Backend tests succeed.
- Nginx configuration passes `nginx -t` before reload.
- Post-deploy SEO smoke check succeeds.
- Unknown URLs return 404, private pages expose `noindex`, sitemap URLs return canonical 200 responses, and public pages retain server-rendered headings and links.
