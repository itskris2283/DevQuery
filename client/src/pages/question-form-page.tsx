import QuestionForm from "@/components/question/question-form";
import MainLayout from "@/components/layout/main-layout";

export default function QuestionFormPage() {
  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto py-6">
        <QuestionForm />
      </div>
    </MainLayout>
  );
}