import React from 'react';
import { isApiMode, api } from './apiClient.js';
const bookshopHeroImage = '/uploads/Redesign/hero/Books and Stationery (Hero).png';
const homeTeachingImage = '/uploads/Redesign/hero/Home Teaching-1.jpg';
const schoolStructuringImage = '/uploads/Redesign/hero/School Restructuring-3.jpg';
const specialNeedsImage = '/uploads/Redesign/hero/Special Needs-4.jpg';
const stationeryImage = '/uploads/Redesign/Stationery(Bookshop).jpg';
const teacherRecruitmentImage = '/uploads/Redesign/hero/Teacher Recruitment (Services).jpg';

export const ADMIN_OWNER = 'admin@realmindxgh.com';
const STORAGE_KEY = 'realmindx.adminManagedContent.v2';
const EVENT_NAME = 'realmindx:managed-content-updated';

const now = () => new Date().toISOString();
const slugify = (value = '') =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';

const withAdminMeta = (item, index = 0) => ({
  created_by: ADMIN_OWNER,
  updated_by: ADMIN_OWNER,
  created_at: item.created_at || new Date(Date.UTC(2026, 4, 1, 9, index)).toISOString(),
  updated_at: item.updated_at || new Date(Date.UTC(2026, 4, 10, 9, index)).toISOString(),
  status: item.status || 'published',
  ...item,
});

export const DEFAULT_SERVICES = [
  {
    id: 'teacher-recruitment',
    label: 'Teacher Recruitment',
    icon: 'teacher',
    tag: 'For Schools & Teachers',
    title: 'Connect the Right Teachers with the Right Schools',
    summary: 'A streamlined recruitment process that helps schools find qualified, culture-fit teachers.',
    body: 'Finding a great teacher is one of the most important decisions a school can make. RealMindX runs a streamlined recruitment process that takes the stress out of hiring, matching schools with qualified, passionate teachers who fit their vision and culture.\n\nWhether you are a school with a vacancy or a teacher looking for your next placement, we make the process fast, transparent, and effective.',
    features: 'Vetting and background checks for all candidates\nSubject and level-specific matching\nContract support and onboarding guidance\nOngoing placement follow-up',
    primary_cta_label: 'View Job Posts',
    primary_cta_href: '/jobs',
    secondary_cta_label: 'Post a Vacancy',
    secondary_cta_href: '/contact',
    image_key: 'recruitment',
    badge: 'Most Popular',
    sort_order: 1,
  },
  {
    id: 'teacher-development',
    label: 'Teacher Development',
    icon: 'growth',
    tag: 'CPD Programs',
    title: 'Professional Growth for Every Educator',
    summary: 'Practical CPD programmes designed around real classroom challenges.',
    body: "A school is only as strong as its teachers. Our customised training programs equip educators with the latest classroom strategies, subject expertise, and leadership skills, delivered online or face-to-face to fit your school's schedule.\n\nOur CPD workshops are built around real classroom challenges, not textbook theory.",
    features: 'Pedagogical strategy workshops\nClassroom management and behaviour support\nSubject-specific instructional coaching\nOnline and in-person delivery options\nCertificates of participation issued',
    primary_cta_label: 'Book a Programme',
    primary_cta_href: '/contact',
    secondary_cta_label: '',
    secondary_cta_href: '',
    image_key: 'recruitment',
    badge: '30+ Programmes',
    sort_order: 2,
  },
  {
    id: 'school-structuring',
    label: 'School Structuring',
    icon: 'school',
    tag: 'Institutional Support',
    title: 'Building Schools That Actually Work',
    summary: 'Operational, cultural, and administrative support for stronger schools.',
    body: 'Whether you are starting a new school from scratch or fixing one that has lost its way, RealMindX offers comprehensive structuring services that cover everything from organisational design to school culture.\n\nWe work alongside leadership to build systems that outlast our involvement.',
    features: 'Organisational design and staff structure\nAdministrative systems and workflows\nPhysical infrastructure planning\nSchool culture and values development\nPolicy writing and handbook creation',
    primary_cta_label: 'Enquire Now',
    primary_cta_href: '/contact',
    image_key: 'school',
    badge: '',
    sort_order: 3,
  },
  {
    id: 'bookshop',
    label: 'Bookshop',
    icon: 'book',
    tag: 'Wholesale & Retail',
    title: 'Quality Educational Materials, Delivered',
    summary: 'Textbooks, stationery, and learning materials for schools and families.',
    body: 'The RealMindX Bookshop stocks a wide range of textbooks, stationery, and learning materials at both wholesale and retail prices. We deliver across Accra and beyond, and offer pick-up options too.\n\nSchools and individuals are both welcome.',
    features: 'Textbooks for all grade levels\nStationery and classroom supplies\nWholesale pricing for bulk orders\nNationwide delivery\nIn-store pick-up available',
    primary_cta_label: 'Visit the Bookshop',
    primary_cta_href: 'https://bookshop.realmindxgh.com',
    image_key: 'bookshop',
    badge: '',
    sort_order: 4,
  },
  {
    id: 'tutoring',
    label: 'After-School Tutoring',
    icon: 'tutor',
    tag: 'Online & In-Person',
    title: 'Targeted Academic Support for Every Student',
    summary: 'Structured tutoring for learners who need extra academic support.',
    body: 'Our tutoring programmes give students the extra support they need, taught by qualified tutors in a structured, engaging environment. Sessions are tailored to the individual, not delivered as one-size-fits-all group lessons.\n\nWe cover all grade levels and major subjects.',
    features: 'One-on-one and small group sessions\nMathematics, Science, English and more\nHomework help and exam preparation\nProgress reports to parents\nOnline and in-person options',
    primary_cta_label: 'Book a Tutor',
    primary_cta_href: '/contact',
    image_key: 'tutoring',
    badge: '',
    sort_order: 5,
  },
  {
    id: 'research',
    label: 'Research & Assignments',
    icon: 'research',
    tag: 'Academic Support',
    title: 'Expert Support for Researchers and Students',
    summary: 'Guidance for proposals, analysis, academic writing, and research structure.',
    body: 'From undergraduate assignments to doctoral research, our team provides structured academic support at every stage. We do not write work for students. We guide, coach, and support the process so the finished work is genuinely yours.',
    features: 'Research proposal development\nThesis and dissertation guidance\nData analysis and interpretation (SPSS, R, Excel)\nAcademic writing coaching\nPlagiarism checking and editing',
    primary_cta_label: 'Get Academic Support',
    primary_cta_href: '/contact',
    image_key: 'research',
    badge: '',
    sort_order: 6,
  },
  {
    id: 'secretarial',
    label: 'Secretarial Services',
    icon: 'secretarial',
    tag: 'Documentation & Admin',
    title: 'Professional Documentation Done Right',
    summary: 'Polished administrative, school, and business documentation support.',
    body: 'Our secretarial services handle the written and administrative work that schools, businesses, and individuals often struggle to find time for. Every document we produce is polished, accurate, and ready to use.',
    features: 'Business proposals and reports\nProofreading and editing\nPlagiarism checking and content originality\nDocument formatting and structuring\nSchool newsletters and official communications',
    primary_cta_label: 'Request a Service',
    primary_cta_href: '/contact',
    image_key: 'secretarial',
    badge: '',
    sort_order: 7,
  },
  {
    id: 'special-education',
    label: 'Special Education',
    icon: 'special',
    tag: 'Inclusive Support',
    title: 'Every Child Deserves to Learn',
    summary: 'Inclusive education support for schools, families, and learners.',
    body: 'RealMindX is committed to inclusive education. We work with schools, parents, and specialists to develop proper support systems for students with special educational needs, ensuring no child is left behind.',
    features: 'Individualised Education Plans (IEPs)\nTeacher training on inclusive classroom practice\nLearning resource provision\nClassroom adaptation guidance\nParent and caregiver support sessions',
    primary_cta_label: 'Talk to Us',
    primary_cta_href: '/contact',
    image_key: 'special',
    badge: 'Important Service',
    sort_order: 8,
  },
  {
    id: 'consulting',
    label: 'Educational Consulting',
    icon: 'consulting',
    tag: 'Strategy & Policy',
    title: 'Expert Guidance for Better Educational Outcomes',
    summary: 'Strategy, policy, and improvement planning for education organisations.',
    body: 'Schools and education organisations often have the will to improve but are not sure where to start. Our consulting service provides expert, evidence-based guidance on policy, teaching effectiveness, and institutional strategy, translated into practical action plans.',
    features: 'School policy development\nData-driven insights and performance analysis\nStrategic planning and roadmap creation\nLeadership coaching and mentoring\nCurriculum design support',
    primary_cta_label: 'Schedule a Consultation',
    primary_cta_href: '/contact',
    image_key: 'consulting',
    badge: '',
    sort_order: 9,
  },
  {
    id: 'extracurricular',
    label: 'Extracurricular Activities',
    icon: 'extra',
    tag: 'Beyond the Classroom',
    title: 'The Best Facilitators for What Matters Beyond Textbooks',
    summary: 'Reliable facilitators for co-curricular and practical enrichment activities.',
    body: 'A well-rounded education includes more than academics. RealMindX provides qualified facilitators for a wide range of extracurricular activities, available to schools and families both.',
    features: 'Swimming, Karate, and Cooking\nDrama, Music, and Dance\nArt, Painting, and Pottery\nFashion Design and UCMAS\nLanguages: French, Spanish, English and more',
    primary_cta_label: 'Explore Activities',
    primary_cta_href: '/contact',
    image_key: 'tutoring',
    badge: '',
    sort_order: 10,
  },
  {
    id: 'home-schooling',
    label: 'Home Schooling Support',
    icon: 'home',
    tag: 'Personalised Learning',
    title: 'A Complete Home Education, Without the Stress',
    summary: 'Curriculum, lesson planning, tutors, and oversight for home education.',
    body: 'More parents in Ghana are choosing to educate their children at home. RealMindX supports that choice with structured guidance on curriculum selection, lesson planning, and progress tracking. For parents who want full management, we handle everything, from timetabling to teacher recruitment and academic oversight.',
    features: 'Curriculum selection and lesson planning\nFull home-schooling management available\nRecruitment of specialist home tutors\nPerformance monitoring and reporting\nFlexible, child-centred approach',
    primary_cta_label: 'Start Home Schooling',
    primary_cta_href: '/contact',
    image_key: 'tutoring',
    badge: '',
    sort_order: 11,
  },
  {
    id: 'schoolms',
    label: 'SchoolMS',
    icon: 'schoolms',
    tag: 'School Management Platform',
    title: 'The School Management Platform Built for Ghana',
    summary: 'A complete cloud-based management system for Ghanaian schools.',
    body: "SchoolMS is a complete, cloud-based school management system designed specifically for Ghanaian schools. It connects every role in the school, from the morning register to the end-of-term report card sitting in a parent's inbox before they even ask for it.\n\nEvery process that used to take hours now takes minutes.",
    features: "Full school onboarded from a spreadsheet in minutes\nFees paid directly from parents' phones\nAttendance taken in two minutes, absent parents notified automatically\nAI-generated report card remarks built in\nSeparate portals for teachers, parents, and students",
    primary_cta_label: 'Explore SchoolMS',
    primary_cta_href: 'https://schoolms.realmindxgh.com',
    secondary_cta_label: 'Book a Demo',
    secondary_cta_href: '/contact',
    image_key: 'school',
    badge: 'New Product',
    sort_order: 12,
  },
].map((item, index) => withAdminMeta({ status: 'published', ...item }, index));

export const DEFAULT_SITE_COPY = [
  { id: 'services_hero_title', key: 'services_hero_title', label: 'Services hero title', value: 'RealMindX Services', area: 'services' },
  { id: 'services_hero_body', key: 'services_hero_body', label: 'Services hero body', value: 'From teacher recruitment to school transformation, every RealMindX service is organised around one goal: making quality education easier to access, manage, and improve.', area: 'services' },
  { id: 'services_effective_note', key: 'services_effective_note', label: 'Services hero note', value: 'Built for schools, teachers, families, and learners across Ghana.', area: 'services' },
  { id: 'about_hero_body', key: 'about_hero_body', label: 'About hero body', value: 'A dynamic and innovative educational solutions provider dedicated to empowering schools, teachers, and students to achieve excellence.', area: 'about' },
  { id: 'about_who_title', key: 'about_who_title', label: 'About who-we-are title', value: 'A Company Built on a Simple Belief', area: 'about' },
  { id: 'about_who_body', key: 'about_who_body', label: 'About who-we-are body', value: 'RealMindX Education Limited is a registered Ghanaian company with a clear purpose: to make quality education available to every school, teacher, and learner who needs it.\n\nWe are not a tutoring centre. We are not a staffing agency. We are a comprehensive educational services provider, covering the full lifecycle of learning, from finding the right teacher to structuring the school they work in, from training that teacher to supporting the students in their class.\n\nThat breadth is deliberate. Education does not fail at one point. It fails across many interconnected ones, and fixing just one rarely changes outcomes. RealMindX exists to fix them together.', area: 'about' },
  { id: 'terms_body', key: 'terms_body', label: 'Terms body', value: 'The service terms for using RealMindX Education, the job portal, user portal, and bookshop. Users must provide accurate information, keep login credentials secure, and use the RealMindX platform for genuine education, recruitment, bookshop, and support purposes.', area: 'legal' },
  { id: 'privacy_body', key: 'privacy_body', label: 'Privacy body', value: 'How RealMindX handles account, application, contact, and bookshop information. We collect only what is needed to provide services, manage accounts, process enquiries, and keep the platform secure.', area: 'legal' },
  { id: 'bookshop_terms_body', key: 'bookshop_terms_body', label: 'Bookshop terms body', value: 'These terms cover RealMindX Bookshop orders, enquiries, bulk requests, product availability, delivery, returns, and customer communication. Orders are confirmed only after staff review stock, payment, delivery destination, and any special instructions.', area: 'bookshop' },
  { id: 'bookshop_privacy_body', key: 'bookshop_privacy_body', label: 'Bookshop privacy body', value: 'RealMindX Bookshop collects customer names, contact details, order items, delivery preferences, payment references, and enquiry notes only to process orders, provide support, send confirmations, and improve the bookshop experience.', area: 'bookshop' },
].map((item, index) => withAdminMeta({ status: 'published', ...item }, index));

export const DEFAULT_PARTNERS = [
  { id: 'bright-minds-school', name: 'Bright Minds School', icon: 'pBuilding', sort_order: 1 },
  { id: 'elite-high-school', name: 'Elite High School', icon: 'pBook', sort_order: 2 },
  { id: 'greater-accra-education', name: 'Greater Accra Education', icon: 'pStar', sort_order: 3 },
  { id: 'pillar-foundation', name: 'Pillar Foundation', icon: 'pColumn', sort_order: 4 },
  { id: 'open-books-initiative', name: 'Open Books Initiative', icon: 'pLeaf', sort_order: 5 },
  { id: 'volta-learning-trust', name: 'Volta Learning Trust', icon: 'pShield', sort_order: 6 },
].map((item, index) => withAdminMeta({ status: 'published', image_file_id: null, image_url: '', ...item }, index));

export const DEFAULT_PEOPLE = [
  {
    id: 'founder-chief-executive',
    name: 'Team Member',
    position: 'Founder & CEO',
    bio: 'Leads RealMindX strategy, partnerships, and long-term education impact.',
    initials: 'FC',
    image_file_id: null,
    image_url: '',
    sort_order: 1,
  },
  {
    id: 'director-of-programmes',
    name: 'Team Member',
    position: 'Director of Programmes',
    bio: 'Coordinates learning programmes, school support, and service delivery standards.',
    initials: 'DP',
    image_file_id: null,
    image_url: '',
    sort_order: 2,
  },
  {
    id: 'head-of-teacher-placement',
    name: 'Team Member',
    position: 'Head of Teacher Placement',
    bio: 'Guides teacher vetting, school matching, onboarding, and placement follow-up.',
    initials: 'HT',
    image_file_id: null,
    image_url: '',
    sort_order: 3,
  },
  {
    id: 'research-consulting-lead',
    name: 'Team Member',
    position: 'Research & Consulting Lead',
    bio: 'Supports research, school improvement projects, documentation, and institutional consulting.',
    initials: 'RC',
    image_file_id: null,
    image_url: '',
    sort_order: 4,
  },
].map((item, index) => withAdminMeta({ status: 'published', ...item }, index));

export const DEFAULT_HOME_HERO_SLIDES = [
  {
    id: 'school-structuring-hero',
    label: 'School Structuring',
    image_key: 'school',
    image: schoolStructuringImage,
    alt: 'Students focused on classroom work at their desks',
    sort_order: 1,
  },
  {
    id: 'teacher-recruitment-hero',
    label: 'Teacher Recruitment',
    image_key: 'recruitment',
    image: teacherRecruitmentImage,
    alt: 'Students in a Ghanaian classroom focused on their work',
    sort_order: 2,
  },
  {
    id: 'home-teaching-hero',
    label: 'Home Teaching',
    image_key: 'tutoring',
    image: homeTeachingImage,
    alt: 'A teacher guiding a young learner one-on-one at home',
    sort_order: 3,
  },
  {
    id: 'special-education-hero',
    label: 'Special Education',
    image_key: 'special',
    image: specialNeedsImage,
    alt: 'A smiling student supported by inclusive education',
    sort_order: 4,
  },
  {
    id: 'bookshop-hero',
    label: 'Bookshop',
    image_key: 'bookshop',
    image: bookshopHeroImage,
    alt: 'Books and stationery on display at the RealMindX bookshop',
    sort_order: 5,
  },
].map((item, index) => withAdminMeta({ status: 'published', image_file_id: null, image_url: '', ...item }, index));

export const DEFAULT_DONATION_SLIDES = [
  {
    id: 'donation-learning-materials',
    label: 'Learning Materials',
    image_key: 'bookshop',
    image: bookshopHeroImage,
    alt: 'Books and stationery for Ghanaian learners',
    sort_order: 1,
  },
  {
    id: 'donation-teacher-development',
    label: 'Teacher Development',
    image_key: 'recruitment',
    image: teacherRecruitmentImage,
    alt: 'Teacher development session with RealMindX educators',
    sort_order: 2,
  },
  {
    id: 'donation-home-learning',
    label: 'Home Learning',
    image_key: 'tutoring',
    image: homeTeachingImage,
    alt: 'A child receiving learning support at home',
    sort_order: 3,
  },
  {
    id: 'donation-school-systems',
    label: 'School Systems',
    image_key: 'school',
    image: schoolStructuringImage,
    alt: 'School transformation and classroom support',
    sort_order: 4,
  },
  {
    id: 'donation-inclusive-support',
    label: 'Inclusive Support',
    image_key: 'special',
    image: specialNeedsImage,
    alt: 'Inclusive education support for every learner',
    sort_order: 5,
  },
].map((item, index) => withAdminMeta({ status: 'published', image_file_id: null, image_url: '', ...item }, index));

export const SEED_CONTENT = {
  services: DEFAULT_SERVICES,
  siteCopy: DEFAULT_SITE_COPY,
  partners: DEFAULT_PARTNERS,
  homeHeroSlides: DEFAULT_HOME_HERO_SLIDES,
  donationSlides: DEFAULT_DONATION_SLIDES,
  categories: [
    { id: 1, label: 'Textbooks', value: 'Textbooks', slug: 'textbooks', count: 6, description: 'Curriculum books for core Ghanaian school levels.' },
    { id: 2, label: 'Storybooks', value: 'Storybooks', slug: 'storybooks', count: 1, description: 'Reading materials for children and young learners.' },
    { id: 3, label: 'Workbooks', value: 'Workbooks', slug: 'workbooks', count: 1, description: 'Practice books and guided exercises.' },
    { id: 4, label: 'Stationery', value: 'Stationery', slug: 'stationery', count: 3, description: 'Everyday supplies for schools and families.' },
    { id: 5, label: 'Exam Prep', value: 'Exam Prep', slug: 'exam-prep', count: 2, description: 'BECE, WASSCE, and revision resources.' },
    { id: 6, label: 'Teaching Resources', value: 'Teaching Resources', slug: 'teaching-resources', count: 1, description: 'Classroom aids and teaching packs.' },
    { id: 7, label: 'Early Years', value: 'Early Years', slug: 'early-years', count: 1, description: 'Nursery, KG, and early literacy materials.' },
    { id: 8, label: 'School Supplies', value: 'School Supplies', slug: 'school-supplies', count: 1, description: 'Bulk school supply bundles.' },
  ].map(withAdminMeta),
  flyers: [
    { id: 1, headline: 'Back-to-School', accent: 'Sale', subline: 'Up to 25% off selected curriculum textbooks', badge: 'SHOP THE SALE', image: '' },
    { id: 2, headline: 'New BECE & WASSCE', accent: 'Past Questions', subline: '2015-2024, fully solved - just arrived', badge: 'NEW STOCK', image: '' },
    { id: 3, headline: 'Wholesale for', accent: 'Schools', subline: 'Class sets delivered within 48 hours', badge: 'GET A QUOTE', image: '' },
  ].map(withAdminMeta),
  products: [
    { id: 1, name: 'Mathematics for JHS 1', author: 'MoE Ghana', source: 'MoE Ghana', category: 'Textbooks', price: 28, oldPrice: 35, badges: ['sale'], stock: 'in', level: 'JHS', subject: 'Mathematics', image: bookshopHeroImage },
    { id: 2, name: 'Integrated Science SHS 1 & 2', author: 'Approabi Publishers', source: 'Approabi Publishers', category: 'Textbooks', price: 42, oldPrice: null, badges: ['popular'], stock: 'in', level: 'SHS', subject: 'Science', image: bookshopHeroImage },
    { id: 3, name: 'English for Primary 3', author: 'Ghana Education Service', source: 'Ghana Education Service', category: 'Textbooks', price: 18, oldPrice: null, badges: ['new'], stock: 'in', level: 'Primary', subject: 'English', image: bookshopHeroImage },
    { id: 4, name: 'Anansi the Spider: Story Collection', author: 'Various Authors', source: 'Local distributor', category: 'Storybooks', price: 15, oldPrice: null, badges: [], stock: 'in', level: 'Primary', subject: 'English', image: homeTeachingImage },
    { id: 5, name: 'BECE Past Questions 2015-2024', author: 'RealMindX', source: 'RealMindX', category: 'Exam Prep', price: 22, oldPrice: null, badges: ['popular'], stock: 'low', level: 'JHS', subject: 'Core Subjects', image: teacherRecruitmentImage },
    { id: 6, name: 'Maths Workbook (Primary 4-6)', author: 'MoE Ghana', source: 'MoE Ghana', category: 'Workbooks', price: 12, oldPrice: null, badges: ['new'], stock: 'in', level: 'Primary', subject: 'Mathematics', image: bookshopHeroImage },
    { id: 7, name: 'A4 Exercise Books (Pack of 10)', author: null, source: 'Stationery wholesaler', category: 'Stationery', price: 18, oldPrice: 22, badges: ['sale'], stock: 'in', level: null, subject: null, image: stationeryImage },
    { id: 8, name: 'Geometry Set (Maped)', author: null, source: 'Stationery wholesaler', category: 'Stationery', price: 8.5, oldPrice: null, badges: [], stock: 'in', level: null, subject: null, image: stationeryImage },
    { id: 9, name: 'Social Studies for JHS 3', author: 'Badu Publishers', source: 'Badu Publishers', category: 'Textbooks', price: 30, oldPrice: null, badges: [], stock: 'out', level: 'JHS', subject: 'Social Studies', image: schoolStructuringImage },
    { id: 10, name: 'Multiplication Flashcard Set', author: 'RealMindX', source: 'RealMindX', category: 'Teaching Resources', price: 14, oldPrice: null, badges: ['new'], stock: 'in', level: 'Primary', subject: 'Mathematics', image: teacherRecruitmentImage },
    { id: 11, name: 'WASSCE Chemistry Solved Problems', author: 'Approabi', source: 'Approabi Publishers', category: 'Exam Prep', price: 35, oldPrice: null, badges: ['popular'], stock: 'in', level: 'SHS', subject: 'Science', image: teacherRecruitmentImage },
    { id: 12, name: 'Nursery Alphabet Cards (Set)', author: null, source: 'Early years supplier', category: 'Early Years', price: 10, oldPrice: null, badges: [], stock: 'in', level: 'Nursery', subject: null, image: homeTeachingImage },
    { id: 13, name: 'School Supply Bundle - Class 1', author: null, source: 'Stationery wholesaler', category: 'School Supplies', price: 65, oldPrice: 80, badges: ['sale', 'popular'], stock: 'in', level: 'Primary', subject: null, image: stationeryImage },
    { id: 14, name: 'French for Beginners (JHS)', author: 'Alliance Francaise', source: 'Alliance Francaise', category: 'Textbooks', price: 25, oldPrice: null, badges: [], stock: 'in', level: 'JHS', subject: 'French', image: bookshopHeroImage },
    { id: 15, name: 'Coloured Pencils (24 Pack)', author: null, source: 'Stationery wholesaler', category: 'Stationery', price: 12, oldPrice: null, badges: ['new'], stock: 'in', level: null, subject: null, image: stationeryImage },
    { id: 16, name: 'Comprehensive RME for Primary 5', author: 'MoE Ghana', source: 'MoE Ghana', category: 'Textbooks', price: 20, oldPrice: null, badges: [], stock: 'low', level: 'Primary', subject: 'RME', image: bookshopHeroImage },
  ].map((item, index) => withAdminMeta({ ...item, slug: slugify(item.name) }, index)),
  jobs: [
    { id: 1, title: 'Mathematics Teacher (JHS)', organisation: 'Annan House School', school: 'Annan House School', location: 'East Legon, Accra', type: 'Full-time', employment_type: 'Full-time', level: 'JHS', subject: 'Mathematics', salary: 'GHS 2,500 - 3,500 / month', posted: '2 days ago', deadline: '31 Jun 2026', description: 'A respected private school in East Legon is looking for a confident JHS Mathematics teacher.', requirements: ['Degree in Mathematics Education or related field', 'NTC License preferred', 'At least 2 years classroom experience'], responsibilities: ['Teach JHS Mathematics', 'Prepare lesson notes and assessments', 'Support learners with remedial sessions'], logo: 'AH' },
    { id: 2, title: 'English Teacher (Primary)', organisation: 'Grace Valley School', school: 'Grace Valley School', location: 'Adenta, Accra', type: 'Full-time', employment_type: 'Full-time', level: 'Primary', subject: 'English', salary: 'GHS 2,000 - 2,800 / month', posted: '3 days ago', deadline: '15 Jun 2026', description: 'Grace Valley School needs a warm, structured English teacher for upper primary learners.', requirements: ['Diploma or degree in Education', 'Strong phonics and literacy instruction skills'], responsibilities: ['Teach English Language', 'Track reading progress', 'Support co-curricular literacy activities'], logo: 'GV' },
    { id: 3, title: 'Science Teacher (SHS)', organisation: 'Lighthouse School', school: 'Lighthouse School', location: 'Tema, Ghana', type: 'Full-time', employment_type: 'Full-time', level: 'SHS', subject: 'Science', salary: 'GHS 3,000 - 4,500 / month', posted: '1 week ago', deadline: '30 Jun 2026', description: 'Lighthouse School is hiring an SHS science teacher with strong practical-lab instruction skills.', requirements: ['Science education degree', 'Lab safety knowledge', 'WASSCE preparation experience'], responsibilities: ['Teach SHS science', 'Prepare lab activities', 'Coach exam candidates'], logo: 'LS' },
    { id: 4, title: 'ICT Teacher', organisation: 'New Generation Academy', school: 'New Generation Academy', location: 'Kasoa, Ghana', type: 'Full-time', employment_type: 'Full-time', level: 'JHS/SHS', subject: 'ICT', salary: 'GHS 2,400 - 3,200 / month', posted: '1 week ago', deadline: '20 Jun 2026', description: 'A growing academy requires an ICT teacher who can blend practical digital literacy with curriculum coverage.', requirements: ['ICT or Computer Science background', 'Classroom experience'], responsibilities: ['Teach ICT', 'Support basic school systems', 'Prepare students for practical assessments'], logo: 'NG' },
  ].map((item, index) => withAdminMeta(item, index)),
  news: [
    { id: 1, title: 'RealMindX Launches SchoolMS for Ghanaian Schools', category: 'Announcement', summary: 'A school management platform built for Ghanaian schools.', body: 'RealMindX has launched SchoolMS to simplify school administration, communication, fees, attendance, and report cards.', date: '10 May 2026' },
    { id: 2, title: 'New CPD Programme for Mathematics Teachers', category: 'CPD', summary: 'Practical classroom training for mathematics teachers.', body: 'The new CPD programme focuses on learner-centred mathematics instruction and assessment.', date: '5 May 2026' },
    { id: 3, title: 'Teaching Vacancies Available Through RealMindX', category: 'Jobs', summary: 'Schools can now publish teaching vacancies through RealMindX.', body: 'Teachers can browse roles, create profiles, and apply through the RealMindX jobs portal.', date: '1 May 2026' },
  ].map((item, index) => withAdminMeta({ ...item, slug: slugify(item.title) }, index)),
  gallery: [
    { id: 1, title: 'Teacher Development Session', description: 'A RealMindX training session with Ghanaian educators.', image: teacherRecruitmentImage },
    { id: 2, title: 'School Partnership Visit', description: 'A visit to a partner school in Accra.', image: schoolStructuringImage },
  ].map(withAdminMeta),
  resources: [
    { id: 1, title: 'Teacher Recruitment Checklist', description: 'A starter checklist for schools preparing to hire teachers.', url: '/resources/teacher-recruitment-checklist' },
    { id: 2, title: 'School Improvement Planning Notes', description: 'A simple planning outline for school leaders.', url: '/resources/school-improvement-planning' },
  ].map(withAdminMeta),
  messages: [
    { id: 1, name: 'Emmanuel Osei', email: 'eosei@gmail.com', subject: 'Enquiry about Teacher Recruitment', service: 'Teacher Recruitment', status: 'new', message: 'I would like to know how your recruitment process works.', date: '14 May 2026' },
    { id: 2, name: 'Grace Acheampong', email: 'grace@gmail.com', subject: 'Home Schooling Support for my son', service: 'Home Schooling', status: 'new', message: 'Please contact me about home-schooling support.', date: '13 May 2026' },
    { id: 3, name: 'Daniel Amponsah', email: 'dan@gmail.com', subject: 'Bulk stationery order enquiry', service: 'Bookshop', status: 'read', message: 'We need stationery packs for a school order.', date: '12 May 2026' },
  ].map(withAdminMeta),
  orders: [
    { id: 1, order_reference: 'RMX-BOOK-1001', customer_name: 'Mavis Tetteh', email: 'mavis@example.com', phone: '+233 55 000 1001', status: 'new', total_amount: 124, delivery_method: 'delivery', location: 'Adenta', items: [{ product_name: 'Mathematics for JHS 1', quantity: 2, unit_price: 28 }, { product_name: 'Exercise Books', quantity: 3, unit_price: 18 }] },
  ].map(withAdminMeta),
  newsletters: [
    { id: 1, email: 'teacher@example.com', source: 'bookshop', status: 'active' },
  ].map(withAdminMeta),
  settings: [
    { id: 1, key: 'site_name', value: 'RealMindX Education', public: true },
    { id: 2, key: 'tagline', value: 'Holistic learning, conveniently for every mind.', public: true },
    { id: 3, key: 'contact_email', value: 'info@realmindxgh.com', public: true },
    { id: 4, key: 'primary_phone', value: '+233 55 803 9190', public: true },
    { id: 5, key: 'address', value: 'Dome Pillar 2, Accra, Ghana', public: true },
  ].map(withAdminMeta),
};

export const CATEGORIES = SEED_CONTENT.categories;
export const SAMPLE_PRODUCTS = SEED_CONTENT.products;

// Canonical job-post vocabulary, shared by the admin job form and the public
// jobs filter sidebar so admin-entered values always match a filter option.
export const JOB_LEVELS = ['Nursery/KG', 'Primary', 'JHS', 'SHS'];
export const JOB_SUBJECTS = ['Mathematics', 'English', 'Science', 'ICT', 'French', 'Social Studies', 'Special Needs', 'Art', 'Music', 'Physical Education'];
export const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Volunteer'];

const clone = value => JSON.parse(JSON.stringify(value));

export const getManagedContent = () => {
  if (typeof window === 'undefined') return clone(SEED_CONTENT);
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_CONTENT));
      return clone(SEED_CONTENT);
    }
    return { ...clone(SEED_CONTENT), ...JSON.parse(stored) };
  } catch {
    return clone(SEED_CONTENT);
  }
};

export const saveManagedContent = next => {
  if (typeof window === 'undefined') return next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  return next;
};

export const resetManagedContent = () => saveManagedContent(clone(SEED_CONTENT));

const nextId = items => Math.max(0, ...items.map(item => Number(item.id) || 0)) + 1;
const sameId = (a, b) => String(a) === String(b);

export const createManagedItem = (collection, item) => {
  const content = getManagedContent();
  const row = withAdminMeta({
    id: nextId(content[collection] || []),
    status: item.status || 'published',
    slug: item.slug || slugify(item.name || item.title || item.label || item.key),
    ...item,
    created_at: now(),
    updated_at: now(),
  });
  const next = { ...content, [collection]: [row, ...(content[collection] || [])] };
  saveManagedContent(next);
  return row;
};

export const updateManagedItem = (collection, id, patch) => {
  const content = getManagedContent();
  const nextItems = (content[collection] || []).map(item =>
    sameId(item.id, id)
      ? {
          ...item,
          ...patch,
          slug: patch.slug || item.slug || slugify(patch.name || patch.title || item.name || item.title),
          updated_by: ADMIN_OWNER,
          updated_at: now(),
        }
      : item,
  );
  const next = { ...content, [collection]: nextItems };
  saveManagedContent(next);
  return nextItems.find(item => sameId(item.id, id));
};

export const deleteManagedItem = (collection, id) => {
  const content = getManagedContent();
  const next = { ...content, [collection]: (content[collection] || []).filter(item => !sameId(item.id, id)) };
  saveManagedContent(next);
};

export const useManagedContent = () => {
  const [content, setContent] = React.useState(getManagedContent);

  React.useEffect(() => {
    const handleUpdate = () => setContent(getManagedContent());
    window.addEventListener(EVENT_NAME, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(EVENT_NAME, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  return content;
};

export const useManagedCollection = collection => {
  const content = useManagedContent();
  return content[collection] || [];
};

export const publicItems = items => (items || []).filter(item => item.status === 'published' || item.is_active === true);

// ============================================================
// Public submission helpers - the bridge between public-facing
// forms and the data layer. In API mode (VITE_API_BASE set) they
// POST to the Flask backend; otherwise they persist to the local
// managed-content store so the admin console reflects real activity.
// Payload shapes mirror the backend so the swap is transport-only.
// ============================================================

const localOrderReference = () => 'RMX-' + Math.random().toString(36).slice(2, 8).toUpperCase();

export const submitOrder = async ({ customer_name, email, phone, delivery_method = 'delivery', location, items = [], notes, turnstileToken } = {}) => {
  const cleanItems = items.map(item => ({
    product_id: item.product_id ?? null,
    product_name: item.product_name,
    quantity: Number(item.quantity) || 1,
    unit_price: Number(item.unit_price) || 0,
  }));

  if (isApiMode()) {
    const payload = { customer_name, email, phone, delivery_method, location, notes, items: cleanItems };
    if (turnstileToken) payload.turnstile_token = turnstileToken;
    const data = await api.createOrder(payload);
    return data.order || data;
  }

  const itemsTotal = cleanItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const total = itemsTotal + (delivery_method === 'pickup' ? 0 : 15);
  const order_reference = localOrderReference();
  const row = createManagedItem('orders', {
    order_reference,
    customer_name,
    email,
    phone,
    status: 'new',
    total_amount: total,
    delivery_method,
    location: location || null,
    items: cleanItems.map(({ product_name, quantity, unit_price }) => ({ product_name, quantity, unit_price })),
  });
  return { ...row, order_reference };
};

export const submitMessage = async ({ name, email, phone, subject = 'Website enquiry', service, message, turnstileToken } = {}) => {
  if (isApiMode()) {
    const payload = { name, email, phone, subject, message, source: service || 'site' };
    if (turnstileToken) payload.turnstile_token = turnstileToken;
    return api.sendContact(payload);
  }
  const ticket_reference = `RMX-${Date.now().toString().slice(-6)}`;
  const row = createManagedItem('messages', {
    name,
    email,
    subject,
    service: service || 'Website',
    status: 'new',
    message,
    ticket_reference,
    date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  });
  return { ...row, ticket_reference };
};

export const subscribeNewsletter = async (email, source = 'site', turnstileToken) => {
  if (isApiMode()) {
    const payload = { email, source };
    if (turnstileToken) payload.turnstile_token = turnstileToken;
    return api.subscribeNewsletter(payload);
  }
  const content = getManagedContent();
  const exists = (content.newsletters || []).some(row => (row.email || '').toLowerCase() === String(email || '').toLowerCase());
  if (exists) return { status: 'already_subscribed' };
  createManagedItem('newsletters', { email, source, status: 'active' });
  return { status: 'subscribed' };
};
