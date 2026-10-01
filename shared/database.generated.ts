// Generated from migrated PostgreSQL by scripts/db-test.mjs --generate-types. Do not edit.
// Public application schema only. Runtime checks and RLS are not represented by TS types.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
export interface Database {
  public: {
    Tables: {
      business_profiles: {
        Row: {
          user_id: string
          name: string
          website: string
          contact_email: string
          state: string
          version: number
          review_notes: string
          updated_at: string
        }
        Insert: {
          user_id: string
          name: string
          website: string
          contact_email: string
          state?: string
          version?: number
          review_notes?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          name?: string
          website?: string
          contact_email?: string
          state?: string
          version?: number
          review_notes?: string
          updated_at?: string
        }
        Relationships: [{"columns":["user_id"],"isOneToOne":true,"foreignKeyName":"business_profiles_user_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"}]
      }
      campaigns: {
        Row: {
          id: string
          sponsor_id: string
          version: number
          title: string
          disclosure: string
          area: string
          categories: string[]
          family_ids: string[]
          funded: boolean
          state: string
          starts_at: string
          ends_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          sponsor_id: string
          version?: number
          title: string
          disclosure: string
          area: string
          categories: string[]
          family_ids: string[]
          funded?: boolean
          state?: string
          starts_at: string
          ends_at: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          sponsor_id?: string
          version?: number
          title?: string
          disclosure?: string
          area?: string
          categories?: string[]
          family_ids?: string[]
          funded?: boolean
          state?: string
          starts_at?: string
          ends_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [{"columns":["sponsor_id"],"isOneToOne":false,"foreignKeyName":"campaigns_sponsor_id_fkey","referencedColumns":["id"],"referencedRelation":"sponsors"}]
      }
      community_activity: {
        Row: {
          id: string
          owner_id: string
          actor_id: string
          kind: string
          target_id: string
          message: string
          href: string
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          actor_id: string
          kind: string
          target_id: string
          message: string
          href: string
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          actor_id?: string
          kind?: string
          target_id?: string
          message?: string
          href?: string
          read_at?: string | null
          created_at?: string
        }
        Relationships: [{"columns":["actor_id"],"isOneToOne":false,"foreignKeyName":"community_activity_actor_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"},{"columns":["owner_id"],"isOneToOne":false,"foreignKeyName":"community_activity_owner_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"}]
      }
      community_blocks: {
        Row: {
          owner_id: string
          blocked_id: string
          created_at: string
        }
        Insert: {
          owner_id: string
          blocked_id: string
          created_at?: string
        }
        Update: {
          owner_id?: string
          blocked_id?: string
          created_at?: string
        }
        Relationships: [{"columns":["blocked_id"],"isOneToOne":false,"foreignKeyName":"community_blocks_blocked_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"},{"columns":["owner_id"],"isOneToOne":false,"foreignKeyName":"community_blocks_owner_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"}]
      }
      community_posts: {
        Row: {
          id: string
          owner_id: string
          run_id: string
          asset_id: string
          template_id: string
          template_version: number
          caption: string
          brand_opt_in: boolean
          state: string
          version: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          run_id: string
          asset_id: string
          template_id: string
          template_version: number
          caption?: string
          brand_opt_in?: boolean
          state: string
          version?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          run_id?: string
          asset_id?: string
          template_id?: string
          template_version?: number
          caption?: string
          brand_opt_in?: boolean
          state?: string
          version?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [{"columns":["asset_id"],"isOneToOne":true,"foreignKeyName":"community_posts_asset_id_fkey","referencedColumns":["id"],"referencedRelation":"media_assets"},{"columns":["owner_id"],"isOneToOne":false,"foreignKeyName":"community_posts_owner_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"},{"columns":["run_id"],"isOneToOne":false,"foreignKeyName":"community_posts_run_id_fkey","referencedColumns":["id"],"referencedRelation":"quest_runs"},{"columns":["template_id"],"isOneToOne":false,"foreignKeyName":"community_posts_template_id_fkey","referencedColumns":["id"],"referencedRelation":"quest_templates"}]
      }
      community_reports: {
        Row: {
          id: string
          reporter_id: string
          post_id: string | null
          offer_id: string | null
          reason: string
          created_at: string
        }
        Insert: {
          id?: string
          reporter_id: string
          post_id?: string | null
          offer_id?: string | null
          reason: string
          created_at?: string
        }
        Update: {
          id?: string
          reporter_id?: string
          post_id?: string | null
          offer_id?: string | null
          reason?: string
          created_at?: string
        }
        Relationships: [{"columns":["offer_id"],"isOneToOne":false,"foreignKeyName":"community_reports_offer_id_fkey","referencedColumns":["id"],"referencedRelation":"licensing_offers"},{"columns":["post_id"],"isOneToOne":false,"foreignKeyName":"community_reports_post_id_fkey","referencedColumns":["id"],"referencedRelation":"community_posts"},{"columns":["reporter_id"],"isOneToOne":false,"foreignKeyName":"community_reports_reporter_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"}]
      }
      creator_follows: {
        Row: {
          follower_id: string
          creator_id: string
          created_at: string
        }
        Insert: {
          follower_id: string
          creator_id: string
          created_at?: string
        }
        Update: {
          follower_id?: string
          creator_id?: string
          created_at?: string
        }
        Relationships: [{"columns":["creator_id"],"isOneToOne":false,"foreignKeyName":"creator_follows_creator_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"},{"columns":["follower_id"],"isOneToOne":false,"foreignKeyName":"creator_follows_follower_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"}]
      }
      creator_profiles: {
        Row: {
          user_id: string
          display_name: string
          avatar_key: string
          bio: string
          open_to_brands: boolean
          version: number
          updated_at: string
        }
        Insert: {
          user_id: string
          display_name: string
          avatar_key: string
          bio?: string
          open_to_brands?: boolean
          version?: number
          updated_at?: string
        }
        Update: {
          user_id?: string
          display_name?: string
          avatar_key?: string
          bio?: string
          open_to_brands?: boolean
          version?: number
          updated_at?: string
        }
        Relationships: [{"columns":["user_id"],"isOneToOne":true,"foreignKeyName":"creator_profiles_user_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"}]
      }
      licensing_offers: {
        Row: {
          id: string
          post_id: string
          asset_id: string
          brand_id: string
          creator_id: string
          state: string
          suspended: boolean
          moderation_reason: string | null
          version: number
          proposer_id: string
          terms: Json
          accepted_terms: Json | null
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          post_id: string
          asset_id: string
          brand_id: string
          creator_id: string
          state?: string
          suspended?: boolean
          moderation_reason?: string | null
          version?: number
          proposer_id: string
          terms: Json
          accepted_terms?: Json | null
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          post_id?: string
          asset_id?: string
          brand_id?: string
          creator_id?: string
          state?: string
          suspended?: boolean
          moderation_reason?: string | null
          version?: number
          proposer_id?: string
          terms?: Json
          accepted_terms?: Json | null
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [{"columns":["accepted_by"],"isOneToOne":false,"foreignKeyName":"licensing_offers_accepted_by_fkey","referencedColumns":["id"],"referencedRelation":"profiles"},{"columns":["asset_id"],"isOneToOne":false,"foreignKeyName":"licensing_offers_asset_id_fkey","referencedColumns":["id"],"referencedRelation":"media_assets"},{"columns":["brand_id"],"isOneToOne":false,"foreignKeyName":"licensing_offers_brand_id_fkey","referencedColumns":["user_id"],"referencedRelation":"business_profiles"},{"columns":["creator_id"],"isOneToOne":false,"foreignKeyName":"licensing_offers_creator_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"},{"columns":["post_id"],"isOneToOne":false,"foreignKeyName":"licensing_offers_post_id_fkey","referencedColumns":["id"],"referencedRelation":"community_posts"},{"columns":["proposer_id"],"isOneToOne":false,"foreignKeyName":"licensing_offers_proposer_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"}]
      }
      media_assets: {
        Row: {
          id: string
          owner_id: string
          run_id: string
          kind: string
          slot: number | null
          generation: number
          staging_key: string | null
          object_key: string | null
          state: string
          expected_bytes: number | null
          bytes: number | null
          mime: string | null
          duration_ms: number | null
          sha256: string | null
          metadata: Json
          upload_expires_at: string | null
          is_current: boolean
          created_at: string
          sealed_at: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          owner_id: string
          run_id: string
          kind: string
          slot?: number | null
          generation?: number
          staging_key?: string | null
          object_key?: string | null
          state?: string
          expected_bytes?: number | null
          bytes?: number | null
          mime?: string | null
          duration_ms?: number | null
          sha256?: string | null
          metadata?: Json
          upload_expires_at?: string | null
          is_current?: boolean
          created_at?: string
          sealed_at?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          owner_id?: string
          run_id?: string
          kind?: string
          slot?: number | null
          generation?: number
          staging_key?: string | null
          object_key?: string | null
          state?: string
          expected_bytes?: number | null
          bytes?: number | null
          mime?: string | null
          duration_ms?: number | null
          sha256?: string | null
          metadata?: Json
          upload_expires_at?: string | null
          is_current?: boolean
          created_at?: string
          sealed_at?: string | null
          deleted_at?: string | null
        }
        Relationships: [{"columns":["owner_id"],"isOneToOne":false,"foreignKeyName":"media_assets_owner_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"},{"columns":["run_id","owner_id"],"isOneToOne":false,"foreignKeyName":"media_assets_run_id_owner_id_fkey","referencedColumns":["id","owner_id"],"referencedRelation":"quest_runs"}]
      }
      media_cleanup: {
        Row: {
          asset_id: string
          object_key: string | null
          staging_key: string | null
          created_at: string
          completed_at: string | null
        }
        Insert: {
          asset_id: string
          object_key?: string | null
          staging_key?: string | null
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          asset_id?: string
          object_key?: string | null
          staging_key?: string | null
          created_at?: string
          completed_at?: string | null
        }
        Relationships: [{"columns":["asset_id"],"isOneToOne":true,"foreignKeyName":"media_cleanup_asset_id_fkey","referencedColumns":["id"],"referencedRelation":"media_assets"}]
      }
      profiles: {
        Row: {
          id: string
          auth_user_id: string | null
          display_name: string
          timezone: string
          locale: string
          preferences: Json
          imported_summary: string
          onboarding_complete: boolean
          account_status: string
          created_at: string
          updated_at: string
          account_type: string | null
        }
        Insert: {
          id: string
          auth_user_id?: string | null
          display_name?: string
          timezone?: string
          locale?: string
          preferences?: Json
          imported_summary?: string
          onboarding_complete?: boolean
          account_status?: string
          created_at?: string
          updated_at?: string
          account_type?: string | null
        }
        Update: {
          id?: string
          auth_user_id?: string | null
          display_name?: string
          timezone?: string
          locale?: string
          preferences?: Json
          imported_summary?: string
          onboarding_complete?: boolean
          account_status?: string
          created_at?: string
          updated_at?: string
          account_type?: string | null
        }
        Relationships: [{"columns":["auth_user_id"],"isOneToOne":true,"foreignKeyName":"profiles_auth_user_id_fkey","referencedColumns":["id"],"referencedRelation":"users"}]
      }
      quest_authors: {
        Row: {
          template_id: string
          author_id: string
          draft_id: string
        }
        Insert: {
          template_id: string
          author_id: string
          draft_id: string
        }
        Update: {
          template_id?: string
          author_id?: string
          draft_id?: string
        }
        Relationships: [{"columns":["author_id"],"isOneToOne":false,"foreignKeyName":"quest_authors_author_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"},{"columns":["draft_id"],"isOneToOne":true,"foreignKeyName":"quest_authors_draft_id_fkey","referencedColumns":["id"],"referencedRelation":"quest_drafts"},{"columns":["template_id"],"isOneToOne":true,"foreignKeyName":"quest_authors_template_id_fkey","referencedColumns":["id"],"referencedRelation":"quest_templates"}]
      }
      quest_drafts: {
        Row: {
          id: string
          author_id: string
          content: Json
          state: string
          version: number
          review_notes: string
          template_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          author_id: string
          content: Json
          state?: string
          version?: number
          review_notes?: string
          template_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          author_id?: string
          content?: Json
          state?: string
          version?: number
          review_notes?: string
          template_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [{"columns":["author_id"],"isOneToOne":false,"foreignKeyName":"quest_drafts_author_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"},{"columns":["template_id"],"isOneToOne":false,"foreignKeyName":"quest_drafts_template_id_fkey","referencedColumns":["id"],"referencedRelation":"quest_templates"}]
      }
      quest_inspirations: {
        Row: {
          run_id: string
          post_id: string
          template_id: string
          template_version: number
          created_at: string
        }
        Insert: {
          run_id: string
          post_id: string
          template_id: string
          template_version: number
          created_at?: string
        }
        Update: {
          run_id?: string
          post_id?: string
          template_id?: string
          template_version?: number
          created_at?: string
        }
        Relationships: [{"columns":["post_id"],"isOneToOne":false,"foreignKeyName":"quest_inspirations_post_id_fkey","referencedColumns":["id"],"referencedRelation":"community_posts"},{"columns":["run_id"],"isOneToOne":true,"foreignKeyName":"quest_inspirations_run_id_fkey","referencedColumns":["id"],"referencedRelation":"quest_runs"},{"columns":["template_id"],"isOneToOne":false,"foreignKeyName":"quest_inspirations_template_id_fkey","referencedColumns":["id"],"referencedRelation":"quest_templates"}]
      }
      quest_runs: {
        Row: {
          id: string
          owner_id: string
          template_id: string
          family_id: string
          intensity: string
          category: string
          snapshot: Json
          snapshot_hash: string
          outing: Json
          participants: number
          budget_amount: number
          budget_scope: string
          currency: string
          area: string
          selected_role: string | null
          status: string
          evidence_manifest: Json | null
          evidence_hash: string | null
          reward_decision: Json | null
          review_deadline: string | null
          requires_review: boolean
          review_reason: string | null
          created_at: string
          finalized_at: string | null
          privacy_redacted_at: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          template_id: string
          family_id: string
          intensity: string
          category: string
          snapshot: Json
          snapshot_hash: string
          outing: Json
          participants: number
          budget_amount: number
          budget_scope: string
          currency: string
          area?: string
          selected_role?: string | null
          status?: string
          evidence_manifest?: Json | null
          evidence_hash?: string | null
          reward_decision?: Json | null
          review_deadline?: string | null
          requires_review?: boolean
          review_reason?: string | null
          created_at?: string
          finalized_at?: string | null
          privacy_redacted_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          template_id?: string
          family_id?: string
          intensity?: string
          category?: string
          snapshot?: Json
          snapshot_hash?: string
          outing?: Json
          participants?: number
          budget_amount?: number
          budget_scope?: string
          currency?: string
          area?: string
          selected_role?: string | null
          status?: string
          evidence_manifest?: Json | null
          evidence_hash?: string | null
          reward_decision?: Json | null
          review_deadline?: string | null
          requires_review?: boolean
          review_reason?: string | null
          created_at?: string
          finalized_at?: string | null
          privacy_redacted_at?: string | null
          updated_at?: string
        }
        Relationships: [{"columns":["owner_id"],"isOneToOne":false,"foreignKeyName":"quest_runs_owner_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"},{"columns":["template_id"],"isOneToOne":false,"foreignKeyName":"quest_runs_template_id_fkey","referencedColumns":["id"],"referencedRelation":"quest_templates"}]
      }
      quest_series: {
        Row: {
          id: string
          author_id: string
          title: string
          premise: string
          cover: string
          kind: string
          state: string
          version: number
          first_published_at: string | null
          privacy_redacted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          author_id: string
          title: string
          premise: string
          cover: string
          kind: string
          state?: string
          version?: number
          first_published_at?: string | null
          privacy_redacted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          author_id?: string
          title?: string
          premise?: string
          cover?: string
          kind?: string
          state?: string
          version?: number
          first_published_at?: string | null
          privacy_redacted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [{"columns":["author_id"],"isOneToOne":false,"foreignKeyName":"quest_series_author_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"}]
      }
      quest_series_follows: {
        Row: {
          series_id: string
          follower_id: string
          created_at: string
        }
        Insert: {
          series_id: string
          follower_id: string
          created_at?: string
        }
        Update: {
          series_id?: string
          follower_id?: string
          created_at?: string
        }
        Relationships: [{"columns":["follower_id"],"isOneToOne":false,"foreignKeyName":"quest_series_follows_follower_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"},{"columns":["series_id"],"isOneToOne":false,"foreignKeyName":"quest_series_follows_series_id_fkey","referencedColumns":["id"],"referencedRelation":"quest_series"}]
      }
      quest_series_parts: {
        Row: {
          id: string
          series_id: string
          position: number
          title: string
          template_id: string
          template_version: number
          quest_snapshot: Json
          prerequisite_part_id: string | null
          prerequisite_reason: string
          published: boolean
          first_published_at: string | null
          privacy_redacted_at: string | null
          source_run_id: string | null
          source_context: Json | null
        }
        Insert: {
          id: string
          series_id: string
          position: number
          title: string
          template_id: string
          template_version: number
          quest_snapshot: Json
          prerequisite_part_id?: string | null
          prerequisite_reason?: string
          published?: boolean
          first_published_at?: string | null
          privacy_redacted_at?: string | null
          source_run_id?: string | null
          source_context?: Json | null
        }
        Update: {
          id?: string
          series_id?: string
          position?: number
          title?: string
          template_id?: string
          template_version?: number
          quest_snapshot?: Json
          prerequisite_part_id?: string | null
          prerequisite_reason?: string
          published?: boolean
          first_published_at?: string | null
          privacy_redacted_at?: string | null
          source_run_id?: string | null
          source_context?: Json | null
        }
        Relationships: [{"columns":["prerequisite_part_id"],"isOneToOne":false,"foreignKeyName":"quest_series_parts_prerequisite_part_id_fkey","referencedColumns":["id"],"referencedRelation":"quest_series_parts"},{"columns":["series_id"],"isOneToOne":false,"foreignKeyName":"quest_series_parts_series_id_fkey","referencedColumns":["id"],"referencedRelation":"quest_series"},{"columns":["source_run_id"],"isOneToOne":false,"foreignKeyName":"quest_series_parts_source_run_id_fkey","referencedColumns":["id"],"referencedRelation":"quest_runs"},{"columns":["template_id"],"isOneToOne":false,"foreignKeyName":"quest_series_parts_template_id_fkey","referencedColumns":["id"],"referencedRelation":"quest_templates"}]
      }
      quest_templates: {
        Row: {
          id: string
          family_id: string
          version: number
          category: string
          intensity: string
          title: string
          content: Json
          published: boolean
          created_at: string
          variant_key: string
        }
        Insert: {
          id: string
          family_id: string
          version?: number
          category: string
          intensity: string
          title: string
          content: Json
          published?: boolean
          created_at?: string
          variant_key?: string
        }
        Update: {
          id?: string
          family_id?: string
          version?: number
          category?: string
          intensity?: string
          title?: string
          content?: Json
          published?: boolean
          created_at?: string
          variant_key?: string
        }
        Relationships: []
      }
      redemptions: {
        Row: {
          id: string
          owner_id: string
          offer_id: string
          merchant_id: string
          point_cost: number
          terms: string
          offer_version: number
          state: string
          created_at: string
          expires_at: string
          consumed_at: string | null
          consumed_by: string | null
          closed_at: string | null
        }
        Insert: {
          id?: string
          owner_id: string
          offer_id: string
          merchant_id: string
          point_cost: number
          terms: string
          offer_version: number
          state?: string
          created_at?: string
          expires_at: string
          consumed_at?: string | null
          consumed_by?: string | null
          closed_at?: string | null
        }
        Update: {
          id?: string
          owner_id?: string
          offer_id?: string
          merchant_id?: string
          point_cost?: number
          terms?: string
          offer_version?: number
          state?: string
          created_at?: string
          expires_at?: string
          consumed_at?: string | null
          consumed_by?: string | null
          closed_at?: string | null
        }
        Relationships: [{"columns":["consumed_by"],"isOneToOne":false,"foreignKeyName":"redemptions_consumed_by_fkey","referencedColumns":["id"],"referencedRelation":"profiles"},{"columns":["merchant_id"],"isOneToOne":false,"foreignKeyName":"redemptions_merchant_id_fkey","referencedColumns":["id"],"referencedRelation":"sponsors"},{"columns":["offer_id"],"isOneToOne":false,"foreignKeyName":"redemptions_offer_id_fkey","referencedColumns":["id"],"referencedRelation":"reward_offers"},{"columns":["owner_id"],"isOneToOne":false,"foreignKeyName":"redemptions_owner_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"}]
      }
      render_jobs: {
        Row: {
          id: string
          owner_id: string
          run_id: string
          manifest: Json
          manifest_hash: string
          renderer_version: string
          status: string
          attempts: number
          manual_retries: number
          fence: number
          lease_expires_at: string | null
          output_asset_id: string | null
          error_code: string | null
          privacy_redacted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          run_id: string
          manifest: Json
          manifest_hash: string
          renderer_version?: string
          status?: string
          attempts?: number
          manual_retries?: number
          fence?: number
          lease_expires_at?: string | null
          output_asset_id?: string | null
          error_code?: string | null
          privacy_redacted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          run_id?: string
          manifest?: Json
          manifest_hash?: string
          renderer_version?: string
          status?: string
          attempts?: number
          manual_retries?: number
          fence?: number
          lease_expires_at?: string | null
          output_asset_id?: string | null
          error_code?: string | null
          privacy_redacted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [{"columns":["output_asset_id"],"isOneToOne":false,"foreignKeyName":"render_jobs_output_asset_id_fkey","referencedColumns":["id"],"referencedRelation":"media_assets"},{"columns":["owner_id"],"isOneToOne":false,"foreignKeyName":"render_jobs_owner_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"},{"columns":["run_id","owner_id"],"isOneToOne":false,"foreignKeyName":"render_jobs_run_id_owner_id_fkey","referencedColumns":["id","owner_id"],"referencedRelation":"quest_runs"}]
      }
      render_outbox: {
        Row: {
          job_id: string
          created_at: string
          dispatched_at: string | null
          dispatch_attempts: number
        }
        Insert: {
          job_id: string
          created_at?: string
          dispatched_at?: string | null
          dispatch_attempts?: number
        }
        Update: {
          job_id?: string
          created_at?: string
          dispatched_at?: string | null
          dispatch_attempts?: number
        }
        Relationships: [{"columns":["job_id"],"isOneToOne":true,"foreignKeyName":"render_outbox_job_id_fkey","referencedColumns":["id"],"referencedRelation":"render_jobs"}]
      }
      reward_ledger: {
        Row: {
          id: string
          owner_id: string
          asset: string
          delta: number
          reason: string
          event_key: string
          run_id: string | null
          redemption_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          asset: string
          delta: number
          reason: string
          event_key: string
          run_id?: string | null
          redemption_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          asset?: string
          delta?: number
          reason?: string
          event_key?: string
          run_id?: string | null
          redemption_id?: string | null
          created_at?: string
        }
        Relationships: [{"columns":["owner_id"],"isOneToOne":false,"foreignKeyName":"reward_ledger_owner_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"},{"columns":["redemption_id"],"isOneToOne":false,"foreignKeyName":"reward_ledger_redemption_id_fkey","referencedColumns":["id"],"referencedRelation":"redemptions"},{"columns":["run_id"],"isOneToOne":false,"foreignKeyName":"reward_ledger_run_id_fkey","referencedColumns":["id"],"referencedRelation":"quest_runs"}]
      }
      reward_offers: {
        Row: {
          id: string
          merchant_id: string
          version: number
          title: string
          terms: string
          area: string
          currency: string
          point_cost: number
          stock_total: number
          stock_available: number
          stock_reserved: number
          stock_consumed: number
          funded: boolean
          is_demo: boolean
          active: boolean
          starts_at: string
          ends_at: string
          per_user_limit: number
          reservation_minutes: number
          created_at: string
        }
        Insert: {
          id?: string
          merchant_id: string
          version?: number
          title: string
          terms: string
          area: string
          currency: string
          point_cost: number
          stock_total: number
          stock_available: number
          stock_reserved?: number
          stock_consumed?: number
          funded?: boolean
          is_demo?: boolean
          active?: boolean
          starts_at: string
          ends_at: string
          per_user_limit?: number
          reservation_minutes?: number
          created_at?: string
        }
        Update: {
          id?: string
          merchant_id?: string
          version?: number
          title?: string
          terms?: string
          area?: string
          currency?: string
          point_cost?: number
          stock_total?: number
          stock_available?: number
          stock_reserved?: number
          stock_consumed?: number
          funded?: boolean
          is_demo?: boolean
          active?: boolean
          starts_at?: string
          ends_at?: string
          per_user_limit?: number
          reservation_minutes?: number
          created_at?: string
        }
        Relationships: [{"columns":["merchant_id"],"isOneToOne":false,"foreignKeyName":"reward_offers_merchant_id_fkey","referencedColumns":["id"],"referencedRelation":"sponsors"}]
      }
      share_links: {
        Row: {
          id: string
          owner_id: string
          run_id: string
          asset_id: string
          token_hash: string
          caption: string
          created_at: string
          expires_at: string
          revoked_at: string | null
        }
        Insert: {
          id?: string
          owner_id: string
          run_id: string
          asset_id: string
          token_hash: string
          caption?: string
          created_at?: string
          expires_at?: string
          revoked_at?: string | null
        }
        Update: {
          id?: string
          owner_id?: string
          run_id?: string
          asset_id?: string
          token_hash?: string
          caption?: string
          created_at?: string
          expires_at?: string
          revoked_at?: string | null
        }
        Relationships: [{"columns":["asset_id"],"isOneToOne":false,"foreignKeyName":"share_links_asset_id_fkey","referencedColumns":["id"],"referencedRelation":"media_assets"},{"columns":["owner_id"],"isOneToOne":false,"foreignKeyName":"share_links_owner_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"},{"columns":["run_id","owner_id"],"isOneToOne":false,"foreignKeyName":"share_links_run_id_owner_id_fkey","referencedColumns":["id","owner_id"],"referencedRelation":"quest_runs"}]
      }
      social_photo_cleanup: {
        Row: {
          object_key: string
          owner_id: string
          created_at: string
          completed_at: string | null
        }
        Insert: {
          object_key: string
          owner_id: string
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          object_key?: string
          owner_id?: string
          created_at?: string
          completed_at?: string | null
        }
        Relationships: [{"columns":["owner_id"],"isOneToOne":false,"foreignKeyName":"social_photo_cleanup_owner_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"}]
      }
      social_profiles: {
        Row: {
          user_id: string
          username: string | null
          photo_key: string | null
          version: number
        }
        Insert: {
          user_id: string
          username?: string | null
          photo_key?: string | null
          version?: number
        }
        Update: {
          user_id?: string
          username?: string | null
          photo_key?: string | null
          version?: number
        }
        Relationships: [{"columns":["user_id"],"isOneToOne":true,"foreignKeyName":"social_profiles_user_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"}]
      }
      sponsors: {
        Row: {
          id: string
          name: string
          approved: boolean
          area: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          approved?: boolean
          area: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          approved?: boolean
          area?: string
          created_at?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          owner_id: string
          xp: number
          points: number
          version: number
          updated_at: string
        }
        Insert: {
          owner_id: string
          xp?: number
          points?: number
          version?: number
          updated_at?: string
        }
        Update: {
          owner_id?: string
          xp?: number
          points?: number
          version?: number
          updated_at?: string
        }
        Relationships: [{"columns":["owner_id"],"isOneToOne":true,"foreignKeyName":"wallets_owner_id_fkey","referencedColumns":["id"],"referencedRelation":"profiles"}]
      }
    }
    Views: Record<string, never>
    Functions: {
      sq_abandon_run: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_accept_run: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_accept_series_run: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_cancel_redemption: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_check_session: { Args: { p_actor: string; p_session: string }; Returns: boolean }
      sq_claim_render: { Args: { p_job: string }; Returns: Json }
      sq_community_media: { Args: { p_actor: string; p_post: string; p_offer: string }; Returns: Json }
      sq_community_mutate: { Args: { p_actor: string; p_action: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_community_read: { Args: { p_actor: string; p_view: string; p_input: Json }; Returns: Json }
      sq_consume_redemption: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_create_share: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_delete_account: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_delete_media: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_delete_run_media: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_eligibility: { Args: { p_actor: string; p_family: string }; Returns: Json }
      sq_fail_render: { Args: { p_job: string; p_fence: number; p_error: string }; Returns: Json }
      sq_finalize_account_deletion: { Args: { p_actor: string }; Returns: Json }
      sq_finish_render: { Args: { p_job: string; p_fence: number; p_output: Json }; Returns: Json }
      sq_flag_run: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_memberships: { Args: { p_actor: string }; Returns: Json }
      sq_operator_state: { Args: { p_actor: string }; Returns: Json }
      sq_pause_campaign: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_pause_offer: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_publish_offer: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_reconcile: { Args: { p_limit?: number }; Returns: Json }
      sq_redemption_material: { Args: { p_actor: string; p_redemption: string; p_token_hash?: string }; Returns: Json }
      sq_request_render: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_reserve_reward: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_reserve_upload: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_review_evidence: { Args: { p_actor: string; p_run: string }; Returns: Json }
      sq_review_run: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_revoke_share: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_schedule_retention: { Args: { p_limit?: number }; Returns: number }
      sq_seal_media: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_series_mutate: { Args: { p_actor: string; p_action: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_series_read: { Args: { p_actor: string; p_view: string; p_input: Json }; Returns: Json }
      sq_set_template_publication: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_social_follow: { Args: { p_actor: string; p_target: string; p_following: boolean }; Returns: Json }
      sq_social_photo: { Args: { p_actor: string; p_key: string }; Returns: Json }
      sq_social_photo_key: { Args: { p_actor: string; p_target: string }; Returns: string }
      sq_social_read: { Args: { p_actor: string; p_target: string }; Returns: Json }
      sq_social_save: { Args: { p_actor: string; p_input: Json }; Returns: Json }
      sq_submit_run: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_update_clip: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_upsert_campaign: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_upsert_profile: { Args: { p_actor: string; p_input: Json }; Returns: Json }
      sq_upsert_sponsor: { Args: { p_actor: string; p_input: Json; p_key: string; p_hash: string }; Returns: Json }
      sq_wallet_audit: { Args: { p_actor: string }; Returns: Json }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
