import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, PlusIcon, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

const QUESTIONS_PER_PAGE = 10;

export default function QuestionsPage() {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);

  // Get parameters from URL
  const initialSortBy = searchParams.get("sort") || "newest";
  const initialFilter = searchParams.get("filter") || "all";
  const initialPage = parseInt(searchParams.get("page") || "1", 10);
  const searchQuery = searchParams.get("search") || "";
  const tagFilter = searchParams.get("tag") || "";

  // State for filter options
  const [sortBy, setSortBy] = useState<string>(initialSortBy);
  const [filter, setFilter] = useState<string>(initialFilter);
  const [page, setPage] = useState<number>(initialPage);
  const [localSearch, setLocalSearch] = useState<string>(searchQuery);

  // Fetch questions with filters
  const { data: questions, isLoading } = useQuery({
    queryKey: ['/api/questions', { sortBy, filter, page, search: searchQuery, tag: tagFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('sortBy', sortBy);
      params.append('offset', ((page - 1) * QUESTIONS_PER_PAGE).toString());
      params.append('limit', QUESTIONS_PER_PAGE.toString());
      
      if (filter !== 'all') {
        params.append('filter', filter);
      }
      
      if (searchQuery) {
        params.append('search', searchQuery);
      }
      
      if (tagFilter) {
        params.append('tag', tagFilter);
      }
      
      const response = await fetch(`/api/questions?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch questions');
      }
      return response.json();
    },
  });

  // Fetch tags for sidebar
  const { data: tags } = useQuery({
    queryKey: ['/api/tags'],
  });

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    
    if (sortBy !== "newest") params.set("sort", sortBy);
    if (filter !== "all") params.set("filter", filter);
    if (page !== 1) params.set("page", page.toString());
    if (searchQuery) params.set("search", searchQuery);
    if (tagFilter) params.set("tag", tagFilter);
    
    const queryString = params.toString();
    const newUrl = queryString ? `/questions?${queryString}` : "/questions";
    navigate(newUrl, { replace: true });
  }, [sortBy, filter, page, searchQuery, tagFilter, navigate]);

  // Handle search form submission
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/questions?search=${encodeURIComponent(localSearch)}`);
  };

  // Clear all filters
  const clearFilters = () => {
    navigate("/questions");
    setSortBy("newest");
    setFilter("all");
    setPage(1);
    setLocalSearch("");
  };

  return (
    <MainLayout>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Main content */}
        <div className="md:col-span-3 space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">
              {searchQuery ? 
                `Search results for "${searchQuery}"` : 
                tagFilter ? 
                  `Questions tagged [${tagFilter}]` : 
                  "All Questions"}
            </h1>
            <Button onClick={() => navigate("/questions/ask")}>
              <PlusIcon className="h-4 w-4 mr-1" /> Ask Question
            </Button>
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap gap-4 justify-between items-center">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={sortBy === "newest" ? "default" : "outline"}
                size="sm"
                onClick={() => setSortBy("newest")}
                className="rounded-full"
              >
                Newest
              </Button>
              <Button
                variant={sortBy === "active" ? "default" : "outline"}
                size="sm"
                onClick={() => setSortBy("active")}
                className="rounded-full"
              >
                Active
              </Button>
              <Button
                variant={sortBy === "votes" ? "default" : "outline"}
                size="sm"
                onClick={() => setSortBy("votes")}
                className="rounded-full"
              >
                Most Votes
              </Button>
            </div>

            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Questions</SelectItem>
                <SelectItem value="unanswered">Unanswered</SelectItem>
                <SelectItem value="solved">Solved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Active filters */}
          {(searchQuery || tagFilter || filter !== "all" || sortBy !== "newest") && (
            <div className="flex flex-wrap gap-2 items-center bg-muted p-2 rounded-md">
              <span className="text-sm font-medium">Active filters:</span>
              
              {searchQuery && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  Search: {searchQuery}
                </Badge>
              )}
              
              {tagFilter && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  Tag: {tagFilter}
                </Badge>
              )}
              
              {filter !== "all" && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  {filter === "unanswered" ? "Unanswered" : "Solved"}
                </Badge>
              )}
              
              {sortBy !== "newest" && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  Sort: {sortBy === "active" ? "Active" : "Most Votes"}
                </Badge>
              )}
              
              <Button 
                variant="ghost" 
                size="sm" 
                className="ml-auto h-7"
                onClick={clearFilters}
              >
                Clear all
              </Button>
            </div>
          )}

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
                  Ask a question
                </Button>
              </div>
            )}
          </div>

          {/* Pagination */}
          {questions && questions.length > 0 && (
            <div className="flex justify-center mt-6">
              <nav className="flex items-center space-x-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                
                {Array.from({ length: 3 }, (_, i) => Math.max(1, page - 1) + i).map((pageNum) => (
                  <Button 
                    key={pageNum}
                    variant={pageNum === page ? "default" : "outline"}
                    size="sm"
                    className="px-3"
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                ))}
                
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </nav>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Search</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearchSubmit}>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search questions..."
                    className="pl-8"
                    value={localSearch}
                    onChange={(e) => setLocalSearch(e.target.value)}
                  />
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Popular Tags</CardTitle>
              <CardDescription>
                Filter questions by tag
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {tags ? (
                tags.map((tag) => (
                  <Badge 
                    key={tag.id} 
                    variant="outline"
                    className={tagFilter === tag.name 
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                      : "hover:bg-accent cursor-pointer"
                    }
                    onClick={() => navigate(`/questions?tag=${tag.name}`)}
                  >
                    {tag.name}
                  </Badge>
                ))
              ) : (
                Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-16 rounded-full" />
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ask a Question</CardTitle>
              <CardDescription>
                Need help? Ask the community
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full"
                onClick={() => navigate("/questions/ask")}
              >
                <PlusIcon className="h-4 w-4 mr-1" />
                Post a Question
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
