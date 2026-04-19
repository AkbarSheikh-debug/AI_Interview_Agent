"""
Demo mode: pre-canned responses for UI testing without a valid OpenAI key.
Set DEMO_MODE=true in .env to activate.
"""
import uuid, json, random

PARSED_RESUME = {
    "name": "Akbar Sheikh",
    "email": "akbar@example.com",
    "phone": "+92-300-0000000",
    "summary": "Machine Learning Engineer with 3+ years of experience in NLP and computer vision systems.",
    "education": [{"degree": "BSc Computer Science", "institution": "FAST-NUCES", "year": "2023"}],
    "experience": [
        {"title": "ML Engineer", "company": "TechStartup", "duration": "2023-2024",
         "description": "Built production RAG pipeline serving 50k documents. Reduced latency by 40%."}
    ],
    "projects": [
        {"name": "Legal RAG System", "description": "Production retrieval-augmented generation system for legal document search using LangChain, ChromaDB and OpenAI embeddings.", "technologies": ["Python", "LangChain", "ChromaDB", "FastAPI"]},
        {"name": "CV Defect Detection", "description": "YOLOv8-based real-time defect detection pipeline for manufacturing quality control, achieving 94% mAP.", "technologies": ["Python", "YOLOv8", "OpenCV", "TensorRT"]}
    ],
    "skills": ["Python", "PyTorch", "LangChain", "FastAPI", "Docker", "RAG", "Transformers", "YOLO"],
    "research": [],
    "primary_field": "nlp",
    "session_id": ""
}

PHASE_RESPONSES = {
    1: [
        "Walk me through your background.",
        "What drew you specifically to machine learning engineering rather than data science or software engineering?",
        "Noted. We will move to the technical portion of the interview."
    ],
    2: [
        "Tell me about your most significant project.",
        "How does the retrieval component work at a technical level?",
        "What chunking strategy did you use, and why?",
        "What is HNSW and why did you choose it over IVFFlat?",
        "What are the failure modes of a RAG system?",
        "Why did you use RAG rather than fine-tuning the model on your legal corpus?",
        "What is the latency profile of your system end-to-end?",
        "Describe how you evaluated the quality of retrieved chunks."
    ],
    3: [
        "Tell me about another project — preferably one with a different technical domain.",
        "How did you handle class imbalance in the defect detection training set?",
        "Walk me through your evaluation methodology — specifically how you computed mAP.",
        "What was your inference pipeline like in production? How did you optimize for latency?",
        "What would you do differently if you were to rebuild this system today?"
    ],
    4: [
        "What is the bias-variance tradeoff?",
        "Explain how self-attention works in a transformer.",
        "What is the difference between L1 and L2 regularization?",
        "What is batch normalization and why does it help training?",
        "Explain gradient descent and the Adam optimizer."
    ],
    5: [
        "Where do you see yourself in five years?",
        "What is the most significant professional challenge you have faced?",
        "How do you operate within a team environment?",
        "Do you have any questions for me?"
    ]
}

FACTUAL_QUESTIONS = [
    {"question": "What is the bias-variance tradeoff?", "answer": "Bias is error from wrong model assumptions (underfitting). Variance is sensitivity to training data fluctuations (overfitting). The goal is to minimize total generalization error by balancing both."},
    {"question": "Explain how self-attention works in a transformer.", "answer": "Self-attention computes Q, K, V projections of the input. Attention weights = softmax(QK^T / sqrt(d_k)). Output = weighted sum of V. Allows each token to attend to all other tokens in parallel."},
    {"question": "What is the difference between L1 and L2 regularization?", "answer": "L1 adds absolute weight values to loss, producing sparse solutions. L2 adds squared weight values, penalizing large weights without zeroing. L1 for feature selection, L2 for general regularization."},
    {"question": "What is batch normalization and why does it help training?", "answer": "Batch norm normalizes layer activations to zero mean and unit variance per mini-batch. Reduces internal covariate shift, enables higher learning rates, acts as mild regularization."},
    {"question": "Explain gradient descent and the Adam optimizer.", "answer": "Gradient descent updates weights in the negative gradient direction. Adam maintains first moment (momentum) and second moment (adaptive learning rate per parameter), combining RMSprop and SGD with momentum."}
]

REPORT_TEMPLATE = {
    "phase2_score": 7.5,
    "phase2_feedback": "Demonstrated solid understanding of RAG fundamentals and vector indexing. Correctly explained HNSW vs IVFFlat trade-offs and chunking strategies. Weaker on failure mode analysis and evaluation methodology.",
    "phase3_score": 6.8,
    "phase3_feedback": "Good grasp of object detection concepts and mAP evaluation. Focal loss explanation was accurate. Could improve on production optimization depth and quantization strategies.",
    "phase4_score": 8.0,
    "phase4_feedback": "4 out of 5 factual questions answered correctly with clear reasoning. Bias-variance and Adam explanations were strong. Batch normalization answer lacked mention of learned affine parameters.",
    "phase5_score": 7.2,
    "phase5_feedback": "Vision is clear and grounded in ML systems. Team player signals were strong. Could improve specificity around how they handle conflict or disagreement in technical decisions.",
    "composite_score": 7.4,
    "overall_summary": "Akbar demonstrates solid ML engineering competency with particular strength in NLP systems and retrieval architectures. Technical depth is good across both theoretical and applied dimensions. Production systems thinking is present but could be deeper in certain areas. Shows genuine curiosity and a collaborative mindset.",
    "hire_recommendation": "hire",
    "strengths": [
        "Strong RAG and vector search knowledge, including indexing trade-offs",
        "Practical production ML experience with real latency and scale constraints",
        "Clear communicator — answers are structured and concise"
    ],
    "areas_for_improvement": [
        "Failure mode and edge case analysis could be more proactive",
        "ML system evaluation methodology needs more rigor",
        "Deeper quantization and model optimization knowledge expected at this level"
    ]
}
