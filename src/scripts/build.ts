import * as fs from 'fs-extra';
import * as path from 'path';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import { Study, StudyMetadata, FeaturedStudy } from './types';

// Configuração do MarkdownIt
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight: function (str, lang) {
    // Prism.js fará o highlight no client-side
    if (lang) {
      return `<pre class="line-numbers"><code class="language-${lang}">${escapeHtml(str)}</code></pre>`;
    }
    return `<pre class="line-numbers"><code>${escapeHtml(str)}</code></pre>`;
  }
}).use(anchor, {
  permalink: anchor.permalink.headerLink()
});

// Caminhos do projeto
const PATHS = {
  studies: path.join(process.cwd(), 'src', 'studies'),
  build: path.join(process.cwd(), 'build'),
  templates: path.join(process.cwd(), 'src', 'templates'),
  featured: path.join(process.cwd(), 'src', 'featured-studies.json')
};

// Escape HTML para código
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Extrai headings do conteúdo para gerar TOC
function extractHeadings(htmlContent: string): Array<{ level: number; text: string; id: string }> {
  const headings: Array<{ level: number; text: string; id: string }> = [];
  const headingRegex = /<h([1-3])[^>]*id="([^"]+)"[^>]*>(.+?)<\/h\1>/g;
  let match;

  while ((match = headingRegex.exec(htmlContent)) !== null) {
    const level = parseInt(match[1]);
    const id = match[2];
    // Remove tags HTML do texto (ex: <a> links que o markdown-it-anchor adiciona)
    const text = match[3].replace(/<[^>]+>/g, '').trim();
    headings.push({ level, text, id });
  }

  return headings;
}

// Gera HTML do TOC
function generateTOC(headings: Array<{ level: number; text: string; id: string }>): string {
  if (headings.length === 0) return '';

  const tocItems = headings
    .map(h => `<li class="toc-item toc-level-${h.level}"><a href="#${h.id}">${h.text}</a></li>`)
    .join('\n');

  return `
    <nav class="toc">
      <h4 class="toc-title">📑 Índice</h4>
      <ul class="toc-list">
        ${tocItems}
      </ul>
    </nav>
  `;
}

// Encontra todos os arquivos .md recursivamente
function findMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath));
    } else if (item.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Processa um arquivo markdown
function processMarkdownFile(filePath: string): Study {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(fileContent);
  
  // Valida frontmatter obrigatório
  if (!data.title || !data.banner || !data.date) {
    throw new Error(`Frontmatter incompleto em ${filePath}. Obrigatórios: title, banner, date`);
  }
  
  // Calcula slug relativo
  const relativePath = path.relative(PATHS.studies, filePath);
  const slug = relativePath.replace(/\.md$/, '').replace(/\\/g, '/');
  
  // Converte markdown para HTML
  const htmlContent = md.render(content);
  
  // Ajusta links internos (.md -> .html)
  const adjustedHtml = htmlContent.replace(
    /href="([^"]+)\.md"/g, 
    'href="$1.html"'
  );
  
  // Extrai headings do HTML (após conversão, com IDs corretos)
  const headings = extractHeadings(adjustedHtml);
  
  return {
    title: data.title,
    banner: data.banner,
    tags: data.tags || [],
    date: data.date,
    slug,
    htmlContent: adjustedHtml,
    rawContent: content,
    toc: generateTOC(headings)
  };
}

// Gera página HTML de um study
function generateStudyPage(study: Study, template: string): string {
  const bannerHtml = `<img src="${study.banner}" alt="${study.title}" class="banner">`;
  
  const headerHtml = `
    <div class="study-header">
      <h1 class="study-title">${study.title}</h1>
      <div class="study-meta">
        <span>📅 ${new Date(study.date).toLocaleDateString('pt-BR')}</span>
        ${study.tags.length > 0 ? `
          <div class="tags">
            ${study.tags.map(tag => `<span class="tag">#${tag}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
  
  const contentHtml = `
    ${study.toc}
    <div class="content-wrapper">
      ${bannerHtml}
      ${headerHtml}
      <article class="content">
        ${study.htmlContent}
      </article>
    </div>
  `;
  
  return template
    .replace('{{TITLE}}', study.title)
    .replace('{{DESCRIPTION}}', `Estudo sobre ${study.title}`)
    .replace('{{CONTENT}}', contentHtml);
}

// Gera página inicial
function generateIndexPage(studies: Study[], template: string): string {
  // Tenta carregar featured studies
  let featuredStudies: FeaturedStudy[] = [];
  if (fs.existsSync(PATHS.featured)) {
    featuredStudies = JSON.parse(fs.readFileSync(PATHS.featured, 'utf-8'));
  }
  
  // Gera seção de featured (se existir)
  let featuredSection = '';
  if (featuredStudies.length > 0) {
    const featuredCards = featuredStudies
      .map(featured => {
        const study = studies.find(s => s.slug === featured.slug);
        if (!study) return '';
        
        return `
          <a href="/${study.slug}.html" class="study-card">
            <img src="${study.banner}" alt="${study.title}" class="study-card-banner">
            <div class="study-card-content">
              <h3 class="study-card-title">${study.title}</h3>
              <p class="study-card-meta">${featured.reason}</p>
              <div class="study-card-tags">
                ${study.tags.map(tag => `<span class="study-card-tag">#${tag}</span>`).join('')}
              </div>
            </div>
          </a>
        `;
      })
      .join('');
    
    featuredSection = `
      <section>
        <h3 class="section-title">⭐ Destaques</h3>
        <div class="studies-grid">
          ${featuredCards}
        </div>
      </section>
    `;
  }
  
  // Ordena studies por data (mais recente primeiro)
  const sortedStudies = [...studies].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  
  // Lista de todos os studies
  const allStudiesList = sortedStudies
    .map(study => `
      <li>
        <a href="/${study.slug}.html">
          <span class="study-title">${study.title}</span>
          <span class="study-date">${new Date(study.date).toLocaleDateString('pt-BR')}</span>
        </a>
      </li>
    `)
    .join('');
  
  return template
    .replace('{{FEATURED_SECTION}}', featuredSection)
    .replace('{{ALL_STUDIES}}', allStudiesList);
}

// Build principal
async function build() {
  console.log('🚀 Iniciando build...\n');
  
  // Limpa diretório build
  await fs.emptyDir(PATHS.build);
  console.log('✅ Diretório build limpo');
  
  // Carrega templates
  const studyTemplate = await fs.readFile(
    path.join(PATHS.templates, 'study.html'),
    'utf-8'
  );
  const indexTemplate = await fs.readFile(
    path.join(PATHS.templates, 'index.html'),
    'utf-8'
  );
  console.log('✅ Templates carregados');
  
  // Encontra todos os markdowns
  const markdownFiles = findMarkdownFiles(PATHS.studies);
  console.log(`✅ Encontrados ${markdownFiles.length} arquivos markdown\n`);
  
  if (markdownFiles.length === 0) {
    console.log('⚠️  Nenhum arquivo markdown encontrado em src/studies/');
    console.log('💡 Crie alguns arquivos .md para testar o build!');
    return;
  }
  
  // Processa todos os studies
  const studies: Study[] = [];
  
  for (const filePath of markdownFiles) {
    try {
      const study = processMarkdownFile(filePath);
      studies.push(study);
      
      // Gera HTML
      const html = generateStudyPage(study, studyTemplate);
      
      // Cria diretórios necessários
      const outputPath = path.join(PATHS.build, `${study.slug}.html`);
      await fs.ensureDir(path.dirname(outputPath));
      
      // Salva arquivo
      await fs.writeFile(outputPath, html);
      
      console.log(`✅ ${study.slug}.html`);
    } catch (error) {
      console.error(`❌ Erro ao processar ${filePath}:`, error);
    }
  }
  
  // Gera index.html
  const indexHtml = generateIndexPage(studies, indexTemplate);
  await fs.writeFile(path.join(PATHS.build, 'index.html'), indexHtml);
  console.log('\n✅ index.html gerado');
  
  // Copia assets se existirem (imagens dos studies)
  const assetsPath = path.join(process.cwd(), 'src', 'assets');
  if (fs.existsSync(assetsPath)) {
    await fs.copy(assetsPath, path.join(PATHS.build, 'assets'));
    console.log('✅ Assets copiados');
  }
  
  console.log(`\n🎉 Build concluído! ${studies.length} studies gerados.`);
  console.log(`📂 Arquivos em: ${PATHS.build}`);
  console.log('\n💡 Execute "npm run dev" para visualizar o site localmente');
}

// Executa build
build().catch(error => {
  console.error('❌ Erro fatal no build:', error);
  process.exit(1);
});