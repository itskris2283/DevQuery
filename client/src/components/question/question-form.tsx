import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { questionWithTagsSchema, QuestionWithTags } from "@shared/schema";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Image, X } from "lucide-react";

export default function QuestionForm() {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  // Use tagsInput for form and handle conversion to array internally
  const [tagsInput, setTagsInput] = useState("");

  const form = useForm<QuestionWithTags>({
    resolver: zodResolver(questionWithTagsSchema),
    defaultValues: {
      title: "",
      content: "",
      tags: [],
    },
  });

  // Image upload mutation
  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);
      
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      
      if (!res.ok) {
        throw new Error("Failed to upload image");
      }
      
      return res.json();
    },
  });

  // Question submission mutation
  const submitQuestionMutation = useMutation({
    mutationFn: async (data: QuestionWithTags & { imageUrl?: string }) => {
      const res = await apiRequest("POST", "/api/questions", data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Your question has been posted",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/questions'] });
      setLocation(`/questions/${data.id}`);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to post question: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type and size
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file",
        description: "Please upload an image file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast({
        title: "File too large",
        description: "Image must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    setImageFile(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const onSubmit = async (data: QuestionWithTags) => {
    try {
      // Upload image if present
      let imageUrl: string | undefined;
      if (imageFile) {
        setIsUploading(true);
        const result = await uploadImageMutation.mutateAsync(imageFile);
        imageUrl = result.imageUrl;
        setIsUploading(false);
      }

      // Submit question - ensure tags are always arrays
      await submitQuestionMutation.mutateAsync({
        ...data,
        // Make sure tags are lowercase for consistency
        tags: Array.isArray(data.tags) 
          ? data.tags.map(tag => tag.toLowerCase()) 
          : [],
        imageUrl,
      });
    } catch (error) {
      console.error("Error submitting question:", error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ask a Question</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Question Title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. How to implement authentication in a MERN stack application?"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Be specific and imagine you're asking another person
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Question Details</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Provide all the details someone would need to answer your question"
                      className="min-h-[150px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Include all the information someone would need to answer your question
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. react,node.js,authentication (comma separated)"
                      value={tagsInput}
                      onChange={(e) => {
                        setTagsInput(e.target.value);
                        // Convert the string input to an array of tags
                        const tagsArray = e.target.value
                          .split(",")
                          .map(tag => tag.trim())
                          .filter(tag => tag.length > 0);
                        // Update the form field with the array
                        field.onChange(tagsArray);
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Add up to 5 tags to describe what your question is about
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <FormLabel>Add Image (Optional)</FormLabel>
              <div className="mt-1">
                {!imagePreview ? (
                  <div className="border-2 border-dashed border-border rounded-md p-6 text-center">
                    <Button
                      type="button"
                      variant="outline"
                      className="mx-auto"
                      onClick={() => document.getElementById("image-upload")?.click()}
                    >
                      <Image className="h-4 w-4 mr-2" />
                      Add Image
                    </Button>
                    <input
                      id="image-upload"
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageChange}
                    />
                    <div className="mt-2 text-sm text-muted-foreground">
                      PNG, JPG, GIF up to 5MB
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="mt-2 max-h-[200px] rounded-md"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={removeImage}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <Button 
                type="submit" 
                disabled={
                  submitQuestionMutation.isPending || 
                  isUploading || 
                  uploadImageMutation.isPending
                }
              >
                {(submitQuestionMutation.isPending || isUploading) ? 
                  "Posting..." : "Post Question"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
