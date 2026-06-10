package com.creatoros.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreateContentProjectRequest {

    @NotBlank(message = "Title is required")
    @Size(min = 2, max = 255, message = "Title must be between 2 and 255 characters")
    private String title;

    @NotBlank(message = "Topic is required")
    @Size(min = 3, message = "Topic must be at least 3 characters")
    private String topic;

    @NotBlank(message = "Primary Goal is required")
    private String primaryGoal;
}
