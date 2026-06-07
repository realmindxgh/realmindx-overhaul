import React from 'react';
import { API_BASE, api, isApiMode } from './apiClient.js';
import {
  DEFAULT_DONATION_SLIDES,
  DEFAULT_HOME_HERO_SLIDES,
  DEFAULT_PARTNERS,
  DEFAULT_PEOPLE,
  DEFAULT_SERVICES,
  DEFAULT_SITE_COPY,
  publicItems,
  useManagedContent,
} from './managedContent.js';
const bookshopImage = '/uploads/Redesign/hero/Books and Stationery (Hero).png';
const homeTeachingImage = '/uploads/Redesign/hero/Home Teaching-1.jpg';
const schoolStructuringImage = '/uploads/Redesign/hero/School Restructuring-3.jpg';
const specialNeedsImage = '/uploads/Redesign/hero/Special Needs-4.jpg';
const teacherRecruitmentImage = '/uploads/Redesign/hero/Teacher Recruitment (Services).jpg';

const serviceImages = {
  recruitment: teacherRecruitmentImage,
  development: teacherRecruitmentImage,
  school: schoolStructuringImage,
  bookshop: bookshopImage,
  tutoring: homeTeachingImage,
  research: schoolStructuringImage,
  secretarial: schoolStructuringImage,
  special: specialNeedsImage,
  consulting: schoolStructuringImage,
  extracurricular: homeTeachingImage,
  homeschool: homeTeachingImage,
  schoolms: schoolStructuringImage,
};

const previewImages = {
  ...serviceImages,
  announcement: teacherRecruitmentImage,
  cpd: teacherRecruitmentImage,
  jobs: schoolStructuringImage,
  classroom: teacherRecruitmentImage,
  field: homeTeachingImage,
  training: schoolStructuringImage,
  community: homeTeachingImage,
};

const apiAssetUrl = value => {
  if (!value || !String(value).startsWith('/uploads/')) return value;
  try {
    return new URL(value, API_BASE.replace(/\/api$/, '')).toString();
  } catch {
    return value;
  }
};

const lines = value =>
  Array.isArray(value)
    ? value.filter(Boolean)
    : String(value || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);

const paragraphs = value =>
  Array.isArray(value)
    ? value.filter(Boolean)
    : String(value || '').split(/\n\s*\n/).map(item => item.trim()).filter(Boolean);

const normaliseService = (service, index = 0) => {
  const id = String(service.id || service.slug || service.label || `service-${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `service-${index + 1}`;
  const ctas = [
    service.primary_cta_label && service.primary_cta_href
      ? { label: service.primary_cta_label, href: service.primary_cta_href, style: 'primary' }
      : null,
    service.secondary_cta_label && service.secondary_cta_href
      ? { label: service.secondary_cta_label, href: service.secondary_cta_href, style: 'outline-navy' }
      : null,
  ].filter(Boolean);

  return {
    ...service,
    id,
    icon: service.icon || 'check',
    label: service.label || service.title || 'Service',
    tag: service.tag || 'RealMindX Service',
    title: service.title || service.label || 'RealMindX Service',
    summary: service.summary || '',
    body: paragraphs(service.body),
    features: lines(service.features),
    ctas,
    img: apiAssetUrl(service.image_url) || service.image || serviceImages[service.image_key] || serviceImages.school,
    sort_order: Number(service.sort_order ?? index),
    status: service.status || 'published',
  };
};

const sortServices = items =>
  publicItems(items)
    .map(normaliseService)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));

const normalisePartner = (partner, index = 0) => ({
  ...partner,
  id: String(partner.id || partner.name || `partner-${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `partner-${index + 1}`,
  name: partner.name || 'Partner',
  icon: partner.icon || 'pBuilding',
  img: apiAssetUrl(partner.image_url) || partner.image || '',
  sort_order: Number(partner.sort_order ?? index),
  status: partner.status || 'published',
});

const normalisePerson = (person, index = 0) => ({
  ...person,
  id: String(person.id || person.name || `person-${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `person-${index + 1}`,
  name: person.name || 'Team Member',
  position: person.position || person.role || 'RealMindX Team',
  bio: person.bio || '',
  initials: person.initials || String(person.name || 'RM')
    .split(/\s+/)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase(),
  img: apiAssetUrl(person.image_url) || person.image || '',
  sort_order: Number(person.sort_order ?? index),
  status: person.status || 'published',
});

const normaliseSlide = (slide, index = 0) => ({
  ...slide,
  id: String(slide.id || slide.label || `slide-${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `slide-${index + 1}`,
  label: slide.label || `Slide ${index + 1}`,
  src: apiAssetUrl(slide.image_url) || slide.image || previewImages[slide.image_key] || serviceImages.school,
  img: apiAssetUrl(slide.image_url) || slide.image || previewImages[slide.image_key] || serviceImages.school,
  alt: slide.alt || slide.label || 'RealMindX image',
  sort_order: Number(slide.sort_order ?? index),
  status: slide.status || 'published',
});

const normaliseNews = (item, index = 0) => {
  const slug = item.slug || String(item.title || `news-${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // Precedence matters here: `item.date` carries an editor's explicitly-chosen
  // "Display Date" (backend display_date column), while `published_at` is
  // auto-populated by the API on every item — including a server-side fallback
  // to the creation timestamp when no publish date is set (see backend
  // api/public.py's /news route). Because of that fallback, `published_at` is
  // *never* empty, so checking it first meant a custom Display Date could never
  // win — it was being stored correctly but silently never shown. An editor's
  // deliberate choice should take precedence; published/created date remains
  // the fallback for the (common) case where no Display Date was set.
  const dateValue = item.date || item.published_at || item.created_at || '';
  const dateLabel = dateValue
    ? new Date(dateValue).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  return {
    ...item,
    id: item.id || slug || `news-${index + 1}`,
    slug,
    cat: item.category || item.cat || 'Update',
    date: Number.isNaN(Date.parse(dateValue)) ? (item.date || '') : dateLabel,
    title: item.title || 'RealMindX Update',
    excerpt: item.summary || item.excerpt || item.body || '',
    body: item.body || '',
    sections: Array.isArray(item.sections)
      ? item.sections.map((section, sectionIndex) => ({
          id: section.id || `${slug || item.id || index}-section-${sectionIndex + 1}`,
          heading: section.heading || '',
          body: section.body || '',
          caption: section.caption || '',
          image_file_id: section.image_file_id || null,
          image_url: apiAssetUrl(section.image_url) || section.image_url || '',
        }))
      : [],
    img: apiAssetUrl(item.image_url) || item.image || previewImages[String(item.category || '').toLowerCase()] || previewImages.announcement,
    href: `/news#post-${slug || item.id}`,
    sort_date: Number.isNaN(Date.parse(dateValue)) ? 0 : Date.parse(dateValue),
    status: item.status || 'published',
  };
};

const normaliseGallery = (item, index = 0) => {
  const id = item.id || String(item.title || `gallery-${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return {
    ...item,
    id,
    tag: item.tag || item.category || 'Gallery',
    caption: item.caption || item.title || 'RealMindX moment',
    image: apiAssetUrl(item.image_url) || item.image || previewImages.community,
    href: `/gallery#gallery-${id}`,
    sort_order: Number(item.sort_order ?? index),
    status: item.status || (item.is_published ? 'published' : undefined) || 'published',
  };
};

export const usePublicServices = () => {
  const localContent = useManagedContent();
  const [apiServices, setApiServices] = React.useState(null);

  React.useEffect(() => {
    if (!isApiMode()) return;
    let alive = true;
    api.fetchServices()
      .then(data => { if (alive) setApiServices(data.items || []); })
      .catch(() => { if (alive) setApiServices([]); });
    return () => { alive = false; };
  }, []);

  const localServices = localContent.services?.length ? localContent.services : DEFAULT_SERVICES;
  const source = isApiMode() ? (apiServices ?? []) : localServices;
  return sortServices(source);
};

export const usePublicPartners = () => {
  const localContent = useManagedContent();
  const [apiPartners, setApiPartners] = React.useState(null);

  React.useEffect(() => {
    if (!isApiMode()) return;
    let alive = true;
    api.fetchPartners()
      .then(data => { if (alive) setApiPartners(data.items || []); })
      .catch(() => { if (alive) setApiPartners([]); });
    return () => { alive = false; };
  }, []);

  const localPartners = localContent.partners?.length ? localContent.partners : DEFAULT_PARTNERS;
  const source = isApiMode() ? (apiPartners ?? []) : localPartners;
  return publicItems(source)
    .map(normalisePartner)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
};

export const usePublicPeople = () => {
  const localContent = useManagedContent();
  const [apiPeople, setApiPeople] = React.useState(null);

  React.useEffect(() => {
    if (!isApiMode()) return;
    let alive = true;
    api.fetchPeople()
      .then(data => { if (alive) setApiPeople(data.items || []); })
      .catch(() => { if (alive) setApiPeople([]); });
    return () => { alive = false; };
  }, []);

  const localPeople = localContent.people?.length ? localContent.people : DEFAULT_PEOPLE;
  const source = isApiMode() ? (apiPeople ?? []) : localPeople;
  return publicItems(source)
    .map(normalisePerson)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
};

const usePublicCollection = (collection, loader, fallback) => {
  const localContent = useManagedContent();
  const [apiItems, setApiItems] = React.useState(null);

  React.useEffect(() => {
    if (!isApiMode()) return;
    let alive = true;
    loader()
      .then(data => { if (alive) setApiItems(data.items || []); })
      .catch(() => { if (alive) setApiItems([]); });
    return () => { alive = false; };
  }, [loader]);

  const localItems = localContent[collection]?.length ? localContent[collection] : fallback;
  return isApiMode() ? (apiItems ?? []) : localItems;
};

export const useHomeHeroSlides = () => {
  const source = usePublicCollection('homeHeroSlides', api.fetchHomeHeroSlides, DEFAULT_HOME_HERO_SLIDES);
  return publicItems(source).map(normaliseSlide).sort((a, b) => a.sort_order - b.sort_order);
};

export const useDonationSlides = () => {
  const source = usePublicCollection('donationSlides', api.fetchDonationSlides, DEFAULT_DONATION_SLIDES);
  return publicItems(source).map(normaliseSlide).sort((a, b) => a.sort_order - b.sort_order);
};

export const usePublicNewsState = (limit = 3) => {
  const localContent = useManagedContent();
  const [apiNews, setApiNews] = React.useState(null);

  React.useEffect(() => {
    if (!isApiMode()) return;
    let alive = true;
    api.fetchNews()
      .then(data => { if (alive) setApiNews(data.items || []); })
      .catch(() => { if (alive) setApiNews([]); });
    return () => { alive = false; };
  }, []);

  const localNews = localContent.news?.length ? localContent.news : [];
  const source = isApiMode() ? (apiNews || []) : localNews;
  const visible = isApiMode() ? source : publicItems(source);
  const items = visible
    .map(normaliseNews)
    .sort((a, b) => b.sort_date - a.sort_date)
    .slice(0, limit);
  return {
    items,
    loading: isApiMode() && apiNews === null,
  };
};

export const usePublicNews = (limit = 3) => {
  return usePublicNewsState(limit).items;
};

export const usePublicGalleryState = (limit = 6) => {
  const localContent = useManagedContent();
  const [apiGallery, setApiGallery] = React.useState(null);

  React.useEffect(() => {
    if (!isApiMode()) return;
    let alive = true;
    api.fetchGallery()
      .then(data => { if (alive) setApiGallery(data.items || []); })
      .catch(() => { if (alive) setApiGallery([]); });
    return () => { alive = false; };
  }, []);

  const localGallery = localContent.gallery?.length ? localContent.gallery : [];
  const source = isApiMode() ? (apiGallery || []) : localGallery;
  const visible = isApiMode() ? source : publicItems(source);
  const items = visible
    .map(normaliseGallery)
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, limit);
  return {
    items,
    loading: isApiMode() && apiGallery === null,
  };
};

export const usePublicGallery = (limit = 6) => {
  return usePublicGalleryState(limit).items;
};

// Hardcoded fallback — mirrors what the migration seeds into the DB.
// If an admin edits a value in the console, the live value takes over.
// In non-API mode (local dev) these are always used.
const CONTACT_DEFAULTS = {
  contact_email: 'info@realmindxgh.com',
  contact_phone_1: '+233 55 803 9190',
  contact_phone_2: '+233 55 452 9493',
  contact_phone_3: '+233 55 132 4729',
  contact_address: 'Dome Pillar 2, Accra, Ghana',
  working_hours_weekday: 'Monday - Friday: 8:00am - 5:00pm',
  working_hours_saturday: 'Saturday: 9:00am - 1:00pm',
  contact_map_embed: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3970.4149449183387!2d-0.21959702603021514!3d5.652959532669197!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xfdf9d0d971fa545%3A0xb6793ef61afc720f!2sDome%20pillar%202!5e0!3m2!1sen!2sgh!4v1780224663665!5m2!1sen!2sgh',
};

export const usePublicSettings = () => {
  const [apiSettings, setApiSettings] = React.useState(null);

  React.useEffect(() => {
    if (!isApiMode()) return;
    let alive = true;
    api.fetchSettings()
      .then(data => { if (alive) setApiSettings(data.settings || {}); })
      .catch(() => { if (alive) setApiSettings({}); });
    return () => { alive = false; };
  }, []);

  // Merge: defaults first, then any live API values on top.
  // While loading (null) or in non-API mode, only defaults are used —
  // no blank flash because the defaults ARE the correct production values.
  const live = isApiMode() && apiSettings !== null ? apiSettings : {};
  return { ...CONTACT_DEFAULTS, ...live };
};

export const useSiteCopy = () => {
  const localContent = useManagedContent();
  const [apiCopy, setApiCopy] = React.useState(null);

  React.useEffect(() => {
    if (!isApiMode()) return;
    let alive = true;
    api.fetchSiteCopy()
      .then(data => { if (alive) setApiCopy(data.items || []); })
      .catch(() => { if (alive) setApiCopy([]); });
    return () => { alive = false; };
  }, []);

  const localCopy = localContent.siteCopy?.length ? localContent.siteCopy : DEFAULT_SITE_COPY;
  const source = isApiMode() && apiCopy?.length ? apiCopy : localCopy;
  return publicItems(source).reduce((acc, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {});
};
