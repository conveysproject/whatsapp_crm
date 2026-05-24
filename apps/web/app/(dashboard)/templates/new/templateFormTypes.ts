export type TemplateCategory = 'marketing' | 'utility' | 'authentication';
export type ParameterFormat = 'positional' | 'named';
export type SubType = 'standard' | 'coupon' | 'lto' | 'carousel';
export type HeaderType = 'none' | 'text' | 'image' | 'video' | 'document' | 'location';
export type OtpType = 'copy_code' | 'one_tap' | 'zero_tap';
export type ButtonType = 'quick_reply' | 'url' | 'phone_number' | 'copy_code';

export interface ButtonDef {
  id: string;
  type: ButtonType;
  text: string;
  url: string;
  urlIsDynamic: boolean;
  urlExample: string;
  phone: string;
  couponExample: string;
}

export interface CarouselCard {
  id: string;
  headerMediaUrl: string;
  bodyText: string;
  buttons: CarouselButtonDef[];
}

export interface CarouselButtonDef {
  id: string;
  type: 'quick_reply' | 'url' | 'phone_number';
  text: string;
  url: string;
  urlIsDynamic: boolean;
  urlExample: string;
  phone: string;
}

export interface TemplateFormState {
  name: string;
  category: TemplateCategory;
  language: string;
  parameterFormat: ParameterFormat;
  subType: SubType;

  headerType: HeaderType;
  headerText: string;
  headerMediaUrl: string;

  bodyText: string;

  footerText: string;

  addSecurityRecommendation: boolean;
  codeExpirationMinutes: string;
  otpType: OtpType;
  otpButtonText: string;

  ltoText: string;
  ltoHasExpiration: boolean;

  couponExampleCode: string;

  buttons: ButtonDef[];

  cards: CarouselCard[];

  variableExamples: Record<string, string>;
}

export const INITIAL_STATE: TemplateFormState = {
  name: '',
  category: 'marketing',
  language: 'en',
  parameterFormat: 'positional',
  subType: 'standard',
  headerType: 'none',
  headerText: '',
  headerMediaUrl: '',
  bodyText: '',
  footerText: '',
  addSecurityRecommendation: false,
  codeExpirationMinutes: '',
  otpType: 'copy_code',
  otpButtonText: '',
  ltoText: '',
  ltoHasExpiration: true,
  couponExampleCode: '',
  buttons: [],
  cards: [
    { id: '1', headerMediaUrl: '', bodyText: '', buttons: [] },
    { id: '2', headerMediaUrl: '', bodyText: '', buttons: [] },
  ],
  variableExamples: {},
};

export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'af', label: 'Afrikaans' },
  { code: 'sq', label: 'Albanian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'az', label: 'Azerbaijani' },
  { code: 'bn', label: 'Bengali' },
  { code: 'bg', label: 'Bulgarian' },
  { code: 'ca', label: 'Catalan' },
  { code: 'zh_CN', label: 'Chinese (Simplified)' },
  { code: 'zh_HK', label: 'Chinese (Hong Kong)' },
  { code: 'zh_TW', label: 'Chinese (Traditional)' },
  { code: 'hr', label: 'Croatian' },
  { code: 'cs', label: 'Czech' },
  { code: 'da', label: 'Danish' },
  { code: 'nl', label: 'Dutch' },
  { code: 'en', label: 'English' },
  { code: 'en_GB', label: 'English (UK)' },
  { code: 'en_US', label: 'English (US)' },
  { code: 'et', label: 'Estonian' },
  { code: 'fil', label: 'Filipino' },
  { code: 'fi', label: 'Finnish' },
  { code: 'fr', label: 'French' },
  { code: 'ka', label: 'Georgian' },
  { code: 'de', label: 'German' },
  { code: 'el', label: 'Greek' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'ha', label: 'Hausa' },
  { code: 'he', label: 'Hebrew' },
  { code: 'hi', label: 'Hindi' },
  { code: 'hu', label: 'Hungarian' },
  { code: 'id', label: 'Indonesian' },
  { code: 'ga', label: 'Irish' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'kn', label: 'Kannada' },
  { code: 'kk', label: 'Kazakh' },
  { code: 'ko', label: 'Korean' },
  { code: 'lo', label: 'Lao' },
  { code: 'lv', label: 'Latvian' },
  { code: 'lt', label: 'Lithuanian' },
  { code: 'mk', label: 'Macedonian' },
  { code: 'ms', label: 'Malay' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'mr', label: 'Marathi' },
  { code: 'nb', label: 'Norwegian' },
  { code: 'fa', label: 'Persian' },
  { code: 'pl', label: 'Polish' },
  { code: 'pt_BR', label: 'Portuguese (Brazil)' },
  { code: 'pt_PT', label: 'Portuguese (Portugal)' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'ro', label: 'Romanian' },
  { code: 'ru', label: 'Russian' },
  { code: 'sr', label: 'Serbian' },
  { code: 'sk', label: 'Slovak' },
  { code: 'sl', label: 'Slovenian' },
  { code: 'es', label: 'Spanish' },
  { code: 'es_AR', label: 'Spanish (Argentina)' },
  { code: 'es_ES', label: 'Spanish (Spain)' },
  { code: 'es_MX', label: 'Spanish (Mexico)' },
  { code: 'sw', label: 'Swahili' },
  { code: 'sv', label: 'Swedish' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'th', label: 'Thai' },
  { code: 'tr', label: 'Turkish' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'ur', label: 'Urdu' },
  { code: 'uz', label: 'Uzbek' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'zu', label: 'Zulu' },
];

export const LIMITS = {
  templateName: 512,
  headerText: 60,
  bodyText: 1024,
  ltoBodyText: 600,
  footerText: 60,
  buttonLabel: 25,
  buttonUrl: 2000,
  buttonPhone: 20,
  couponCode: 20,
  ltoText: 16,
  codeExpiration: { min: 1, max: 90 },
  carouselCards: { min: 2, max: 10 },
  carouselButtonsPerCard: 2,
  totalButtons: 10,
  phoneNumberButtons: 1,
  copyCodeButtons: 1,
  urlButtons: 2,
} as const;
