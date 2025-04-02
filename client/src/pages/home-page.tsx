import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import MainLayout from "@/components/layout/main-layout";
import QuestionCard from "@/components/question/question-card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, PlusIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const sortOptions = [
  { value: "newest", label: "Newest" },
  { value: "active", label: "Active" },
  { value: "votes", label: "Most Votes" },
];

const filterOptions = [
  { value: "all", label: "All Questions" },
  { value: "unanswered", label: "Unanswered" },
  { value: "solved", label: "Solved" },
];

export default function HomePage() {
  const [_, navigate] = useLocation();
  const [sortBy, setSortBy] = useState<string>("newest");
  const [filter, setFilter] = useState<string>("all");

  // Fetch questions with sort and filter options
  const { data: questions, isLoading } = useQuery({
    queryKey: ['/api/questions', { sortBy, filter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('sortBy', sortBy);
      if (filter !== 'all') {
        params.append('filter', filter);
      }
      
      const response = await fetch(`/api/questions?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch questions');
      }
      return response.json();
    },
  });

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Top Questions</h1>
          <Button onClick={() => navigate("/questions/ask")}>
            <PlusIcon className="h-4 w-4 mr-1" /> Ask Question
          </Button>
        </div>

        <div className="flex flex-wrap gap-4 justify-between items-center">
          <div className="flex flex-wrap gap-2">
            {sortOptions.map((option) => (
              <Button
                key={option.value}
                variant={sortBy === option.value ? "default" : "outline"}
                size="sm"
                onClick={() => setSortBy(option.value)}
                className="rounded-full"
              >
                {option.label}
              </Button>
            ))}
          </div>

          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              {filterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Questions list */}
        <div className="space-y-4">
          {isLoading ? (
            // Loading skeletons
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="border rounded-lg p-5">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 flex flex-col items-center space-y-2">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-5 w-8" />
                    <Skeleton className="h-6 w-6 rounded-full" />
                  </div>
                  <div className="flex-1">
                    <Skeleton className="h-6 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-full mb-1" />
                    <Skeleton className="h-4 w-full mb-3" />
                    <div className="flex flex-wrap gap-2 mb-3">
                      <Skeleton className="h-6 w-16 rounded-full" />
                      <Skeleton className="h-6 w-20 rounded-full" />
                      <Skeleton className="h-6 w-14 rounded-full" />
                    </div>
                    <div className="flex justify-between">
                      <div className="flex gap-4">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                      <Skeleton className="h-8 w-40" />
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : questions && questions.length > 0 ? (
            questions.map((question) => (
              <QuestionCard key={question.id} question={question} />
            ))
          ) : (
            <div className="text-center py-10 border rounded-lg">
              <p className="text-lg text-muted-foreground">No questions found</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => navigate("/questions/ask")}
              >
                Be the first to ask a question
              </Button>
            </div>
          )}
        </div>

        {/* Pagination */}
        {questions && questions.length > 0 && (
          <div className="flex justify-center mt-6">
            <nav className="flex items-center space-x-2">
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
              <Button variant="default" size="sm" className="px-3">
                1
              </Button>
              <Button variant="outline" size="sm" className="px-3">
                2
              </Button>
              <Button variant="outline" size="sm" className="px-3">
                3
              </Button>
              <span className="px-1">...</span>
              <Button variant="outline" size="sm" className="px-3">
                10
              </Button>
              <Button variant="outline" size="sm">
                Next
              </Button>
            </nav>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
