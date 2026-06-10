package com.creatoros.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class GoogleMockRequest {

    @NotBlank(message = "Email is required")
    @Pattern(
        regexp = "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", 
        message = "Please enter a valid email address."
    )
    private String email;

    @NotBlank(message = "Name is required")
    private String name;
}
