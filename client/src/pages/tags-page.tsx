import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import MainLayout from "@/components/layout/main-layout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Tag as TagIcon } from "lucide-react";

export default function TagsPage() {
  const [_, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  
  // Fetch all tags
  const { data: tags, isLoading } = useQuery({
    queryKey: ['/api/tags'],
  });

  // Filter tags based on search query
  const filteredTags = tags 
    ? searchQuery 
      ? tags.filter(tag => tag.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : tags
    : [];

  // Group tags into columns for better display
  const groupTagsIntoColumns = (tags, columnsCount = 3) => {
    const result = Array(columnsCount).fill().map(() => []);
    tags.forEach((tag, index) => {
      result[index % columnsCount].push(tag);
    });
    return result;
  };

  const tagColumns = groupTagsIntoColumns(filteredTags, 3);

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Tags</h1>
          <Button onClick={() => navigate("/questions/ask")}>
            Ask Question
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              A tag is a keyword or label that categorizes your question with other, similar questions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Filter by tag name..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, colIndex) => (
              <div key={colIndex} className="space-y-4">
                {Array.from({ length: 5 }).map((_, rowIndex) => (
                  <Skeleton key={rowIndex} className="h-24 w-full rounded-lg" />
                ))}
              </div>
            ))}
          </div>
        ) : filteredTags.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {tagColumns.map((column, colIndex) => (
              <div key={colIndex} className="space-y-4">
                {column.map((tag) => (
                  <Card key={tag.id} className="hover:border-primary cursor-pointer" onClick={() => navigate(`/questions?tag=${tag.name}`)}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-2">
                        <TagIcon className="h-5 w-5 mt-0.5 text-primary" />
                        <div>
                          <h3 className="font-medium text-primary hover:underline">
                            {tag.name}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            {Math.floor(Math.random() * 100)} questions
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 border rounded-lg">
            <h3 className="text-lg font-medium mb-2">No tags found</h3>
            <p className="text-muted-foreground">
              {searchQuery 
                ? `No tags matching "${searchQuery}"` 
                : "There are no tags available yet"}
            </p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
