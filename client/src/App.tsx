import React from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/hooks/use-theme";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";

// Pages
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";
import HomePage from "@/pages/home-page";
import QuestionsPage from "@/pages/questions-page";
import QuestionPage from "@/pages/question-page";
import QuestionFormPage from "@/pages/question-form-page";
import UsersPage from "@/pages/users-page";
import UserProfilePage from "@/pages/user-profile-page";
import MessagesPage from "@/pages/messages-page";
import FollowingPage from "@/pages/following-page";
import MyQuestionsPage from "@/pages/my-questions-page";
import MyAnswersPage from "@/pages/my-answers-page";
import TagsPage from "@/pages/tags-page";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={HomePage} />
      <Route path="/auth" component={AuthPage} />
      
      {/* Questions routes */}
      <ProtectedRoute path="/questions" component={QuestionsPage} />
      <ProtectedRoute path="/questions/ask" component={QuestionFormPage} />
      <ProtectedRoute path="/questions/:id" component={QuestionPage} />
      
      {/* User routes */}
      <ProtectedRoute path="/users" component={UsersPage} />
      <ProtectedRoute path="/users/:id" component={UserProfilePage} />
      
      {/* User activity routes */}
      <ProtectedRoute path="/messages" component={MessagesPage} />
      <ProtectedRoute path="/following" component={FollowingPage} />
      <ProtectedRoute path="/my-questions" component={MyQuestionsPage} />
      <ProtectedRoute path="/my-answers" component={MyAnswersPage} />
      <ProtectedRoute path="/tags" component={TagsPage} />
      
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Router />
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
