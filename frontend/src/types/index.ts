// ============ Constants ============

export const KB_ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer',
} as const

export const ROLE_LEVELS: Record<string, number> = {
  owner: 4,
  admin: 3,
  editor: 2,
  viewer: 1,
}

export type KbRole = typeof KB_ROLES[keyof typeof KB_ROLES]
export type SystemRole = 'user' | 'super_admin'

/**
 * How a document's content_html should be interpreted, and which editor owns it.
 *
 * `richtext` — TipTap. content_md and content_html are two projections of one
 *              ProseMirror document and round-trip on every save.
 * `html`     — a standalone HTML document (e.g. an LLM-generated report).
 *              content_html is authoritative and must never go through the
 *              markdown round trip, which would destroy its layout; content_md
 *              holds a plain-text extraction for search only.
 */
export type ContentFormat = 'richtext' | 'html'

/**
 * Width of the document content column, in px.
 *
 * Shared by the read view, the editor "paper" and the share/public pages so they
 * cannot drift: the read view used to be `max-w-3xl` (768px) while the editor was
 * 1100px, so a document visibly narrowed the moment you stopped editing it.
 */
export const DOC_CONTENT_MAX_WIDTH = 1100

/**
 * Width cap for a standalone HTML document.
 *
 * A report lays itself out — it brings its own sidebar, grid and breakpoints —
 * so constraining it to the prose column wastes most of the pane and triggers
 * its narrow-screen media queries. Still capped so it does not sprawl on an
 * ultrawide display.
 */
export const HTML_DOC_MAX_WIDTH = 1600

// Auth field rules, shared by every form that sets one of these values
// (RegisterPage, ProfilePage). They mirror backend/app/schemas/auth.py — keep
// them in sync: anything a form accepts but the schema rejects surfaces only as
// an opaque 422 after submit.
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128
export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,64}$/
export const USERNAME_RULE_HINT = '3-64位字母、数字、下划线或连字符'
export const DISPLAY_NAME_MAX_LENGTH = 128

// ============ API Response wrapper ============

export interface ApiResponse<T = unknown> {
  success: boolean
  data: T
  error: null | {
    code: string
    message: string
  }
}

export interface PaginatedData<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export type PaginatedResponse<T> = ApiResponse<PaginatedData<T>>

// ============ User ============

export interface User {
  id: string          // UUID
  username: string
  display_name: string
  email: string
  avatar_url: string | null
  role: SystemRole
  is_active: boolean
  created_at: string
  updated_at: string
}

// ============ Auth ============

export interface LoginRequest {
  account: string     // username or email
  password: string
}

export interface RegisterRequest {
  username: string
  display_name: string
  email: string
  password: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  user: User
}

// ============ Knowledge Base ============

export interface KnowledgeBase {
  id: string          // UUID
  name: string
  slug: string
  description: string | null
  icon: string
  icon_url: string | null
  visibility: 'private' | 'public'
  owner_id: string
  member_count?: number
  doc_count?: number
  my_role?: KbRole | null
  created_at: string
  updated_at: string
}

export interface KnowledgeBaseMember {
  id: string
  knowledge_base_id: string
  user_id: string
  user: User
  role: KbRole
  invited_by: string | null
  joined_at: string
}

export interface KbCreate {
  name: string
  description?: string
  icon?: string
  icon_url?: string | null
  visibility?: 'private' | 'public'
}

export interface KbUpdate {
  name?: string
  description?: string
  icon?: string
  icon_url?: string | null
  visibility?: 'private' | 'public'
}

// ============ Section (Directory) ============

export interface Section {
  id: string          // UUID
  knowledge_base_id: string
  parent_id: string | null
  title: string
  sort_order: number
  created_by: string
  created_at: string
  updated_at: string
  children?: Section[]
  documents?: DocumentListItem[]
}

export interface SectionCreate {
  title: string
  parent_id?: string | null
  sort_order?: number
}

export interface SectionUpdate {
  title?: string
  parent_id?: string | null
  sort_order?: number
}

export interface SectionReorderItem {
  id: string
  parent_id: string | null
  sort_order: number
}

// ============ Document ============

export interface Document {
  id: string          // UUID
  knowledge_base_id: string
  section_id: string | null
  parent_id: string | null
  sort_order: number
  title: string
  content_md: string
  content_html: string
  content_format: ContentFormat
  is_public: boolean
  template_id: string | null
  created_by: string
  updated_by: string
  word_count: number
  created_at: string
  updated_at: string
  // joined info
  created_by_user?: User
  updated_by_user?: User
}

export interface DocumentListItem {
  id: string
  knowledge_base_id: string
  section_id: string | null
  parent_id: string | null
  sort_order: number
  title: string
  word_count: number
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
  created_by_user?: User
  updated_by_user?: User
  deleted_at?: string | null
  deleted_by?: string | null
}

export interface DocCreate {
  title: string
  content_md?: string
  content_html?: string
  content_format?: ContentFormat
  section_id?: string | null
  parent_id?: string | null
  template_id?: string | null
  sort_order?: number
}

export interface DocUpdate {
  title?: string
  content_md?: string
  content_html?: string
  /**
   * Sent only when establishing a document's format — omitted on every ordinary
   * save, so an autosave can never flip a rich-text document to html.
   */
  content_format?: ContentFormat
  section_id?: string | null
  parent_id?: string | null
  is_public?: boolean
  word_count?: number
  is_manual_save?: boolean  // if true, backend creates version snapshot
}

// ============ Document Version ============

export interface DocumentVersion {
  id: string
  document_id: string
  version_num: number
  snapshot_by: string
  snapshot_reason: 'manual' | 'restore' | 'pre_restore'
  created_at: string
  snapshot_by_user?: User
}

export interface DocumentVersionDetail extends DocumentVersion {
  content_md: string
  content_html: string
}

// ============ Document Comment ============

export interface DocumentComment {
  id: string
  document_id: string
  user_id: string
  user: User
  content: string
  parent_id: string | null
  created_at: string
  replies?: DocumentComment[]
}

export interface CommentCreate {
  content: string
  parent_id?: string | null
}

// ============ Document Favorite ============

export interface DocumentFavorite {
  id: string
  user_id: string
  document_id: string
  doc_title?: string
  kb_name?: string
  created_at: string
  document?: {
    id: string
    title: string
    knowledge_base_id: string
    section_id: string | null
    updated_at: string
  }
}

// ============ Document Template ============

export interface DocumentTemplate {
  id: string
  name: string
  description: string | null
  content_md: string
  content_html: string
  category: string | null
  is_builtin: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TemplateCreate {
  name: string
  description?: string
  content_md: string
  content_html: string
  category?: string
}

// ============ Document Share ============

export interface DocumentShare {
  id: string
  document_id: string
  share_code: string
  access_level: 'anyone' | 'members_only'
  expires_at: string | null
  has_password: boolean
  created_by: string
  is_active: boolean
  created_at: string
}

export interface ShareCreate {
  access_level?: 'anyone' | 'members_only'
  expires_at?: string | null
  password?: string | null
}

export interface ShareUpdate {
  access_level?: 'anyone' | 'members_only'
  expires_at?: string | null
  password?: string | null
  is_active?: boolean
}

// ============ Card ============

export interface Card {
  id: string
  document_id: string
  content_md: string
  content_html: string
  order_index: number
  created_at: string
  updated_at: string
}

// ============ Asset ============

export interface Asset {
  id: string
  knowledge_base_id: string
  document_id: string | null
  uploader_id: string
  filename: string
  storage_path: string
  url: string
  mime_type: string
  size_bytes: number
  created_at: string
}

// ============ Search ============

export interface SearchResultItem {
  doc_id: string
  title: string
  kb_id: string
  kb_name: string
  snippet: string
  updated_at: string
  updated_by: {
    id: string
    username: string
    display_name: string
  }
}

// ============ Admin ============

export interface AdminStats {
  total_users: number
  total_kbs: number
  public_kbs: number
  private_kbs: number
  total_docs: number
  active_users_7d: number
  new_docs_30d: number
  storage_bytes: number
}

export interface SystemSettings {
  allow_registration: boolean
  max_upload_size_mb: number
  image_max_size_mb: number
  max_versions_per_doc: number
  site_name: string
  site_description: string
}

// ============ Tree Node (UI) ============

export type TreeNodeType = 'section' | 'document'

export interface TreeNode {
  id: string
  type: TreeNodeType
  title: string
  sort_order: number
  parent_id: string | null
  knowledge_base_id: string
  data: Section | DocumentListItem
  children: TreeNode[]
}
