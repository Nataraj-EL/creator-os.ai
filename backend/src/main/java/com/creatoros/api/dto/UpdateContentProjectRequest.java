package com.creatoros.api.dto;

import lombok.Data;

@Data
public class UpdateContentProjectRequest {
    private String title;
    private String hook;
    private String script;
    private String cta;
    private String status;
    private String primaryGoal;
}
