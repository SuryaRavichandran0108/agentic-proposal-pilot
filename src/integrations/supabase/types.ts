export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      agent_logs: {
        Row: {
          action: string
          agent_name: string
          created_at: string
          id: string
          metadata: Json | null
          proposal_id: string
          question_id: string | null
          triggered_by_user_id: string | null
        }
        Insert: {
          action: string
          agent_name: string
          created_at?: string
          id?: string
          metadata?: Json | null
          proposal_id: string
          question_id?: string | null
          triggered_by_user_id?: string | null
        }
        Update: {
          action?: string
          agent_name?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          proposal_id?: string
          question_id?: string | null
          triggered_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_logs_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_logs_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_logs_triggered_by_user_id_fkey"
            columns: ["triggered_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      answers: {
        Row: {
          answer_text: string
          created_at: string
          generated_by: Database["public"]["Enums"]["answer_generated_by"]
          id: string
          question_id: string
          version_number: number
        }
        Insert: {
          answer_text: string
          created_at?: string
          generated_by?: Database["public"]["Enums"]["answer_generated_by"]
          id?: string
          question_id: string
          version_number?: number
        }
        Update: {
          answer_text?: string
          created_at?: string
          generated_by?: Database["public"]["Enums"]["answer_generated_by"]
          id?: string
          question_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      clarification_submissions: {
        Row: {
          created_at: string | null
          draft_message: string
          id: string
          method: string | null
          proposal_id: string
          submitted_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          draft_message: string
          id?: string
          method?: string | null
          proposal_id: string
          submitted_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          draft_message?: string
          id?: string
          method?: string | null
          proposal_id?: string
          submitted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clarification_submissions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clarification_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      clarifications: {
        Row: {
          answer_text: string | null
          answered_at: string | null
          approved_by_user_id: string | null
          created_at: string
          edited_prompt_text: string | null
          id: string
          prompt_text: string
          question_id: string
          status: Database["public"]["Enums"]["clarification_status"] | null
          submission_id: string | null
          suggested_by: Database["public"]["Enums"]["clarification_suggested_by"]
        }
        Insert: {
          answer_text?: string | null
          answered_at?: string | null
          approved_by_user_id?: string | null
          created_at?: string
          edited_prompt_text?: string | null
          id?: string
          prompt_text: string
          question_id: string
          status?: Database["public"]["Enums"]["clarification_status"] | null
          submission_id?: string | null
          suggested_by?: Database["public"]["Enums"]["clarification_suggested_by"]
        }
        Update: {
          answer_text?: string | null
          answered_at?: string | null
          approved_by_user_id?: string | null
          created_at?: string
          edited_prompt_text?: string | null
          id?: string
          prompt_text?: string
          question_id?: string
          status?: Database["public"]["Enums"]["clarification_status"] | null
          submission_id?: string | null
          suggested_by?: Database["public"]["Enums"]["clarification_suggested_by"]
        }
        Relationships: [
          {
            foreignKeyName: "clarifications_approved_by_user_id_fkey"
            columns: ["approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clarifications_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clarifications_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "clarification_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_files: {
        Row: {
          file_name: string
          file_type: string
          file_url: string
          id: string
          proposal_id: string
          status: Database["public"]["Enums"]["file_status"]
          uploaded_at: string
          uploaded_by_user_id: string
        }
        Insert: {
          file_name: string
          file_type: string
          file_url: string
          id?: string
          proposal_id: string
          status?: Database["public"]["Enums"]["file_status"]
          uploaded_at?: string
          uploaded_by_user_id: string
        }
        Update: {
          file_name?: string
          file_type?: string
          file_url?: string
          id?: string
          proposal_id?: string
          status?: Database["public"]["Enums"]["file_status"]
          uploaded_at?: string
          uploaded_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_files_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_files_uploaded_by_user_id_fkey"
            columns: ["uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          client_name: string
          created_at: string
          created_by: string
          due_date: string | null
          id: string
          status: Database["public"]["Enums"]["proposal_status"]
          title: string
          updated_at: string
        }
        Insert: {
          client_name: string
          created_at?: string
          created_by: string
          due_date?: string | null
          id?: string
          status?: Database["public"]["Enums"]["proposal_status"]
          title: string
          updated_at?: string
        }
        Update: {
          client_name?: string
          created_at?: string
          created_by?: string
          due_date?: string | null
          id?: string
          status?: Database["public"]["Enums"]["proposal_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          clarification_answered: boolean
          clarification_required: boolean
          confidence_score: number | null
          created_at: string
          id: string
          question_text: string
          ready_for_drafting: boolean
          requires_review: boolean
          reviewed: boolean
          section_id: string
          source: Database["public"]["Enums"]["question_source"]
          updated_at: string
        }
        Insert: {
          clarification_answered?: boolean
          clarification_required?: boolean
          confidence_score?: number | null
          created_at?: string
          id?: string
          question_text: string
          ready_for_drafting?: boolean
          requires_review?: boolean
          reviewed?: boolean
          section_id: string
          source?: Database["public"]["Enums"]["question_source"]
          updated_at?: string
        }
        Update: {
          clarification_answered?: boolean
          clarification_required?: boolean
          confidence_score?: number | null
          created_at?: string
          id?: string
          question_text?: string
          ready_for_drafting?: boolean
          requires_review?: boolean
          reviewed?: boolean
          section_id?: string
          source?: Database["public"]["Enums"]["question_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      review_assignments: {
        Row: {
          assigned_to_user_id: string
          comment: string | null
          created_at: string
          id: string
          question_id: string
          status: Database["public"]["Enums"]["review_status"]
          updated_at: string
        }
        Insert: {
          assigned_to_user_id: string
          comment?: string | null
          created_at?: string
          id?: string
          question_id: string
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
        }
        Update: {
          assigned_to_user_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          question_id?: string
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_assignments_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_assignments_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          created_at: string
          id: string
          order_index: number
          proposal_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_index: number
          proposal_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          order_index?: number
          proposal_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          format: Database["public"]["Enums"]["submission_format"]
          id: string
          proposal_id: string
          status: Database["public"]["Enums"]["submission_status"]
          submitted_at: string
          submitted_by_user_id: string
          submitted_to: string
        }
        Insert: {
          format?: Database["public"]["Enums"]["submission_format"]
          id?: string
          proposal_id: string
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string
          submitted_by_user_id: string
          submitted_to: string
        }
        Update: {
          format?: Database["public"]["Enums"]["submission_format"]
          id?: string
          proposal_id?: string
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string
          submitted_by_user_id?: string
          submitted_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_submitted_by_user_id_fkey"
            columns: ["submitted_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_clarifications_for_user: {
        Args: Record<PropertyKey, never>
        Returns: {
          clarification_id: string
          prompt_text: string
          status: Database["public"]["Enums"]["clarification_status"]
          suggested_by: Database["public"]["Enums"]["clarification_suggested_by"]
          created_at: string
          answer_text: string
          answered_at: string
          edited_prompt_text: string
          approved_by_user_id: string
          submission_id: string
          question_id: string
          question_text: string
          section_id: string
          section_title: string
          proposal_id: string
          proposal_title: string
          client_name: string
          created_by: string
        }[]
      }
      get_user_proposal_ids: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
    }
    Enums: {
      answer_generated_by: "AI" | "SME"
      clarification_status:
        | "suggested"
        | "approved"
        | "denied"
        | "submitted_to_client"
        | "answered"
      clarification_suggested_by: "agent" | "user"
      file_status: "uploaded" | "parsed" | "failed"
      proposal_status: "draft" | "review" | "submitted"
      question_source: "parsed" | "client" | "SME"
      review_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "rework_requested"
      submission_format: "PDF" | "DOCX" | "ZIP"
      submission_status: "submitted" | "failed"
      user_role: "proposal_manager" | "reviewer" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      answer_generated_by: ["AI", "SME"],
      clarification_status: [
        "suggested",
        "approved",
        "denied",
        "submitted_to_client",
        "answered",
      ],
      clarification_suggested_by: ["agent", "user"],
      file_status: ["uploaded", "parsed", "failed"],
      proposal_status: ["draft", "review", "submitted"],
      question_source: ["parsed", "client", "SME"],
      review_status: [
        "pending",
        "in_progress",
        "completed",
        "rework_requested",
      ],
      submission_format: ["PDF", "DOCX", "ZIP"],
      submission_status: ["submitted", "failed"],
      user_role: ["proposal_manager", "reviewer", "viewer"],
    },
  },
} as const
