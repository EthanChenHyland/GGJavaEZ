package audit.bank;

public final class Account {
    private final String owner;
    private int balance;

    public Account(String owner, int openingBalance) {
        this.owner = owner;
        this.balance = openingBalance;
    }

    public String owner() {
        return owner;
    }

    public int balance() {
        return balance;
    }

    public void deposit(int amount) {
        if (amount < 0) throw new IllegalArgumentException("negative deposit");
        balance = Math.addExact(balance, amount);
    }

    public void withdraw(int amount) {
        if (amount < 0 || amount > balance) throw new IllegalArgumentException("invalid withdrawal");
        balance -= amount;
    }
}
