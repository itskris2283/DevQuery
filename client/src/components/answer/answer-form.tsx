import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAnswerSchema, InsertAnswer } from "@shared/schema";
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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Image, X } from "lucide-react";

type AnswerFormProps = {
  questionId: number;
};

export default function AnswerForm({ questionId }: AnswerFormProps) {
  const { toast } = useToast();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const form = useForm<InsertAnswer>({
    resolver: zodResolver(insertAnswerSchema),
    defaultValues: {
      questionId,
      content: "",
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

  // Answer submission mutation
  const submitAnswerMutation = useMutation({
    mutationFn: async (data: InsertAnswer & { imageUrl?: string }) => {
      const res = await apiRequest("POST", `/api/questions/${questionId}/answers`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Your answer has been posted",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/questions/${questionId}/answers`] });
      form.reset();
      setImageFile(null);
      setImagePreview(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to post answer: ${error.message}`,
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

  const onSubmit = async (data: InsertAnswer) => {
    try {
      // Upload image if present
      let imageUrl: string | undefined;
      if (imageFile) {
        setIsUploading(true);
        const result = await uploadImageMutation.mutateAsync(imageFile);
        imageUrl = result.imageUrl;
        setIsUploading(false);
      }

      // Submit answer
      await submitAnswerMutation.mutateAsync({
        ...data,
        imageUrl,
      });
    } catch (error) {
      console.error("Error submitting answer:", error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Answer</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      placeholder="Write your answer here..."
                      className="min-h-[150px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Be clear, concise, and helpful in your answer
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
                      onClick={() => document.getElementById("answer-image-upload")?.click()}
                    >
                      <Image className="h-4 w-4 mr-2" />
                      Add Image
                    </Button>
                    <input
                      id="answer-image-upload"
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
                  submitAnswerMutation.isPending || 
                  isUploading || 
                  uploadImageMutation.isPending
                }
              >
                {(submitAnswerMutation.isPending || isUploading) ? 
                  "Posting..." : "Post Answer"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
