export const TEACHING_SUBJECTS = [
  'Accounting', 'Agricultural Science', 'Agriculture', 'Applied Technology', 'Arabic',
  'Auto Mechanics', 'Autobody Works', 'Basketry', 'Biology', 'Core Biology', 'Elective Biology', 'Building and Construction',
  'Business Management', 'Business Studies', 'Career Technology', 'Catering / Hospitality', 'Ceramics',
  'Chemistry', 'Core Chemistry', 'Elective Chemistry', 'Christian Religious Studies', 'Clothing and Textiles', 'Commerce', 'Computer Science',
  'Computing', 'Cosmetology', 'Cost Accounting', 'Creative Arts', 'Creative Arts and Design',
  'Dance', 'Design and Technology', 'Diesel Mechanic / Heavy Engine', 'Drama / Theatre Arts', 'Early Childhood Learning Areas',
  'Economics', 'Electrical Installation', 'Electronics', 'Engineering', 'English Language',
  'Entrepreneurship', 'Environmental Science', 'Fashion Design', 'Financial Accounting', 'Food and Nutrition',
  'French', 'General Knowledge in Art', 'General Science', 'Geography', 'Ghanaian Language',
  'Global Perspectives', 'Government / Civics', 'Graphic Design', 'Health Education', 'Heavy Duty Industrial Mechanics',
  'History', 'Home Economics', 'ICT', 'Integrated Science', 'Islamic Religious Studies',
  'Jewellery', 'Law', 'Leatherwork', 'Life Skills', 'Literature',
  'Management in Living', 'Mathematics', 'Core Mathematics', 'Elective Mathematics', 'Mechanical Engineering Technology', 'Media Studies', 'Metalwork',
  'Montessori Learning Areas', 'Motor Vehicle Engineering', 'Music', 'Other Foreign Languages', 'Our World Our People',
  'Performing Arts', 'Philosophy', 'Physical and Health Education', 'Physical Education', 'Physics', 'Core Physics', 'Elective Physics',
  'Picture Making', 'Plumbing', 'Psychology', 'Refrigeration and Air Conditioning', 'Religious and Moral Education',
  'Robotics', 'Science', 'Sculpture', 'Social Studies', 'Sociology',
  'Spanish', 'Technical Drawing', 'Textiles', 'Welding and Fabrication', 'Woodwork / Carpentry and Joinery',
];

const SUBJECT_TRACK_PATTERN = /^(core|elective)\s+(.+)$/i;

export const teachingSubjectParts = value => {
  const normalised = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const match = normalised.match(SUBJECT_TRACK_PATTERN);
  return match
    ? { track: match[1], subject: match[2] }
    : { track: '', subject: normalised };
};

// Broad legacy selections bridge to either track, but two explicit and
// different tracks never match one another.
export const teachingSubjectsCompatible = (left, right) => {
  const a = teachingSubjectParts(left);
  const b = teachingSubjectParts(right);
  return Boolean(a.subject) && a.subject === b.subject && (!a.track || !b.track || a.track === b.track);
};

export const TEACHING_LEVELS = [
  'Early Childhood / Daycare',
  'Pre-School / Nursery',
  'Kindergarten',
  'Lower Primary',
  'Upper Primary',
  'Junior High / Lower Secondary',
  'Senior High / Upper Secondary',
  'Sixth Form / Pre-University',
  'TVET / Vocational',
];

export const TEACHING_WORK_TYPES = ['Full Time', 'Part Time', 'Contract', 'Volunteer', 'Remote / Online'];

export const TEACHING_CURRICULA = [
  'GES / NaCCA Curriculum',
  'TVET / CTVET Curriculum',
  'Cambridge International Curriculum',
  'British / English National Curriculum',
  'Pearson Edexcel Pathway',
  'International Baccalaureate (IB) Curriculum',
  'American Curriculum',
  'Montessori Curriculum',
  'Oxford International Curriculum',
];
