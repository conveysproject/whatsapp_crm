export interface DocImage {
  src: string
  alt: string
  caption?: string
}

export interface DocSection {
  heading?: string
  paragraphs?: string[]
  steps?: string[]
  tip?: string
  warning?: string
  note?: string
  image?: DocImage
}

export interface DocArticle {
  title: string
  slug: string
  description: string
  sections: DocSection[]
}

export interface DocCategory {
  title: string
  slug: string
  description: string
  icon: string
  colorHex: string
  bgHex: string
  articles: DocArticle[]
}
