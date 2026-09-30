public final class Main {
    public static void main(String[] args) {
        Graph graph = new GraphBuilder().build(128);
        int recursiveSum = new GraphMetrics().recursiveSum(graph.nodes[0], 16);
        StageOne entry = new StageOne();
        int checksum = 0;
        for (int iteration = 0; iteration < 320; iteration++) {
            Node node = graph.ordered.get(iteration % graph.ordered.size());
            checksum += entry.evaluate(node, iteration);
        }

        System.out.println("GRAPH nodes=" + graph.nodes.length
            + " map=" + graph.byName.size() + " list=" + graph.ordered.size());
        System.out.println("RECURSIVE_SUM " + recursiveSum);
        System.out.println("CHECKSUM " + checksum);
        System.out.println("CAUGHT " + entry.caught());
    }
}
