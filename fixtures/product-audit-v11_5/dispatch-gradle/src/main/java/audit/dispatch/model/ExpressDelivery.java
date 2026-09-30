package audit.dispatch.model;

public final class ExpressDelivery extends AbstractDelivery {
    private final int priority;

    public ExpressDelivery(int priority) {
        super(5);
        this.priority = priority;
    }

    @Override public String kind() {
        return "express";
    }

    @Override public int charge() {
        return baseFee() + 6 * priority;
    }
}
