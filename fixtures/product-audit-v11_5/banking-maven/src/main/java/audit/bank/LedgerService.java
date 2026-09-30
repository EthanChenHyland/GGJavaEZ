package audit.bank;

public final class LedgerService {
    public Receipt post(String owner, int deposit, int withdrawal) {
        Account account = new Account(owner, 100);
        int opening = account.balance();
        account.deposit(deposit);
        account.withdraw(withdrawal);
        return new Receipt(account.owner(), opening, deposit, withdrawal, account.balance());
    }
}
