import QuestionForm from "@/components/question/question-form";
import MainLayout from "@/components/layout/main-layout";
import { useParams } from "wouter";

export default function QuestionFormPage() {
  // Extract questionId from URL if present (for edit mode)
  const params = useParams<{ id: string }>();
  const questionId = params?.id ? parseInt(params.id) : undefined;
  const isEditMode = !!questionId;

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto py-6">
        <QuestionForm 
          editMode={isEditMode} 
          questionId={questionId} 
        />
      </div>
    </MainLayout>
  );
}