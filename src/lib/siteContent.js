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
  const dateValue = item.published_at || item.date || item.created_at || '';
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
  const source = isApiMode() && apiServices !== null ? apiServices : localServices;
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
  const source = isApiMode() && apiPartners !== null ? apiPartners : localPartners;
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
  const source = isApiMode() && apiPeople !== null ? apiPeople : localPeople;
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
  return isApiMode() && apiItems !== null ? apiItems : localItems;
};

export const useHomeHeroSlides = () => {
  const source = usePublicCollection('homeHeroSlides', api.fetchHomeHeroSlides, DEFAULT_HOME_HERO_SLIDES);
  return publicItems(source).map(normaliseSlide).sort((a, b) => a.sort_order - b.sort_order);
};

export const useDonationSlides = () => {
  const source = usePublicCollection('donationSlides', api.fetchDonationSlides, DEFAULT_DONATION_SLIDES);
  return publicItems(source).map(normaliseSlide).sort((a, b) => a.sort_order - b.sort_order);
};

export const usePublicNews = (limit = 3) => {
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
  const source = isApiMode() && apiNews !== null ? apiNews : localNews;
  const visible = isApiMode() && apiNews ? source : publicItems(source);
  return visible
    .map(normaliseNews)
    .sort((a, b) => b.sort_date - a.sort_date)
    .slice(0, limit);
};

export const usePublicGallery = (limit = 6) => {
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
  const source = isApiMode() && apiGallery !== null ? apiGallery : localGallery;
  const visible = isApiMode() && apiGallery ? source : publicItems(source);
  return visible
    .map(normaliseGallery)
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, limit);
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
