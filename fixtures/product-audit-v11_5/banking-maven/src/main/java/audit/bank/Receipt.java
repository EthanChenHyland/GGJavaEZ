package audit.bank;

public record Receipt(String owner, int opening, int deposit, int withdrawal, int closing) {}
