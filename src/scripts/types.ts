export interface StudyMetadata {
    title: string;
    banner: string;
    tags: string[];
    date: string;
    slug: string; // Path relativo, ex: "tree/bst"
  }
  
export interface Study extends StudyMetadata {
    htmlContent: string;
    rawContent: string; // Markdown original
}
  
export interface FeaturedStudy {
    slug: string;
    reason: string;
}