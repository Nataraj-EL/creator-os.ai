package com.creatoros.api.service;

import com.creatoros.api.model.AiTaskType;

public interface AiProvider {
    boolean supports(AiTaskType taskType);
    String getName();
    <T, R> R execute(AiTaskType taskType, T input, Class<R> responseClass);
}
