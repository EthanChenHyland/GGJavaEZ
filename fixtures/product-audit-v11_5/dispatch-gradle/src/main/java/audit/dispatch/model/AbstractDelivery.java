package audit.dispatch.model;

public abstract class AbstractDelivery implements Delivery {
    private final int baseFee;

    protected AbstractDelivery(int baseFee) {
        this.baseFee = baseFee;
    }

    protected int baseFee() {
        return baseFee;
    }
}
